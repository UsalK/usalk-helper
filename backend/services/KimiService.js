import axios from 'axios';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db, { getActiveShop } from '../db/db.js';
import { Jimp } from 'jimp';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Central replacement config load
const replacementsPath = join(__dirname, '../config/artistReplacements.json');
let artistReplacements = [];
try {
  if (fs.existsSync(replacementsPath)) {
    const fileData = fs.readFileSync(replacementsPath, 'utf8');
    const parsed = JSON.parse(fileData);
    artistReplacements = parsed.map(item => ({
      pattern: new RegExp(item.pattern, 'gi'),
      replacement: item.replacement
    }));
  }
} catch (err) {
  console.error("Failed to load central artist replacements config:", err);
}

function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  let sanitized = text;
  for (const { pattern, replacement } of artistReplacements) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  sanitized = sanitized.replace(/,\s*,/g, ',').replace(/\s*,\s*/g, ', ');
  return sanitized;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Bir API anahtarının hangi sağlayıcıya ait olduğunu önekinden belirler.
// NVIDIA anahtarını OpenRouter'a (veya tersini) göndermek her zaman 401 döner.
function detectProvider(key) {
  if (typeof key !== 'string' || !key.trim()) return null;
  const k = key.trim();
  if (k.startsWith('nvapi-')) return 'nvidia';
  if (k.startsWith('sk-or-')) return 'openrouter';
  return null; // bilinmeyen önek: kaynağına göre karar verilir
}

// Elde bulunan anahtarlardan sağlayıcı bazlı bir liste kurar.
// Sıra korunur: OpenRouter birincil, NVIDIA yedek.
function resolveProviderKeys({ openRouterKey, userApiKey, nvidiaEnvKey }) {
  const found = { openrouter: null, nvidia: null };

  // Kaynağı kesin olanlar (env değişkenleri) önce yerleşir.
  if (openRouterKey?.trim()) found.openrouter = openRouterKey.trim();
  if (nvidiaEnvKey?.trim()) found.nvidia = nvidiaEnvKey.trim();

  // Kullanıcının ayarlar ekranından girdiği anahtar 'nvidia_api_key' altında saklanıyor
  // ama pratikte OpenRouter anahtarı da yapıştırılabiliyor. Öneke göre yerleştir.
  if (userApiKey?.trim()) {
    const uk = userApiKey.trim();
    const provider = detectProvider(uk) || 'nvidia'; // ayar alanının adı gereği varsayılan NVIDIA
    if (!found[provider]) found[provider] = uk;
  }

  return found;
}

// Helper to retry temporary errors (429 rate limit or timeouts)
async function withRetry(fn, retries = 2, delayMs = 2000) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.response?.status === 429 || err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      if (!isRetryable || i === retries) throw err;
      console.warn(`[Retry ${i + 1}/${retries}] Temporary error encountered (${err.message}). Retrying in ${delayMs * (i + 1)}ms...`);
      await new Promise(r => setTimeout(r, delayMs * (i + 1))); // exponential backoff
    }
  }
}

/**
 * @param {Array<{shop_section_id, title}>} sections Verilirse AI, görsele en uygun
 *   mağaza bölümünü bu listeden seçer ve sonuçta shop_section_id döner.
 */
export async function generateSEO(imagePath, targetMarket = "US/UK", shopStyle = "vintage poster, art deco", shopId = null, platform = "etsy", sections = null) {
  const targetShopId = shopId || getActiveShop().shop_id;

  // 1. Key Resolution: NEVER use hardcoded fallback keys
  let userApiKey = null;
  try {
    const stmt = db.prepare('SELECT value FROM settings WHERE shop_id = ? AND key = ?');
    const setting = stmt.get(targetShopId, 'nvidia_api_key');
    if (setting) {
      userApiKey = JSON.parse(setting.value);
    }
  } catch (err) {
    console.error("Error reading api key from db:", err);
  }

  // Get OpenRouter Key from env if present
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const nvidiaEnvKey = process.env.NVIDIA_API_KEY;

  // Optimize and resize image using Jimp (down to 768px for token efficiency)
  const imageBuffer = fs.readFileSync(imagePath);
  const image = await Jimp.read(imageBuffer);
  if (image.width > 768) {
    image.resize({ w: 768 });
  }
  const isPng = imagePath.toLowerCase().endsWith('.png');
  const isWebp = imagePath.toLowerCase().endsWith('.webp');
  const mimeType = isPng ? 'image/png' : (isWebp ? 'image/webp' : 'image/jpeg');
  const dataUrl = await image.getBase64(mimeType);

  // Mağaza bölümü otomatik seçimi: bölüm listesi verilirse şemaya bir alan
  // eklenir ve AI görsele en uygun bölümü BU listeden seçer. Serbest metin
  // üretmemesi için isimlerin birebir kopyalanması şart koşulur.
  const usableSections = Array.isArray(sections)
    ? sections.filter(s => s && s.title && s.shop_section_id)
    : [];

  const sectionSchemaLine = usableSections.length > 0
    ? ',\n  "shop_section": "EXACTLY one name copied verbatim from the allowed list below"'
    : '';

  const sectionInstruction = usableSections.length > 0
    ? `\n\nSHOP SECTION SELECTION:
Pick the single best-fitting section for this artwork from this list. Copy the name EXACTLY as written, character for character. Do not invent new names, do not translate, do not abbreviate. If nothing fits well, pick the closest general one.
Allowed sections:
${usableSections.map(s => `- ${s.title}`).join('\n')}`
    : '';

  // Shortened and token-efficient system prompt
  const systemPrompt = platform === 'shopify'
    ? `You are a Shopify E-commerce copywriter. Analyze the artwork image and generate a short, clean, premium product title (max 50 characters, 4-6 words) and search-optimized product metadata in JSON format. Do not use keyword stuffing.`
    : `You are an Etsy SEO expert. Analyze the artwork image and return a JSON object with optimized listing metadata. Do not mention specific artist/brand names. Return ONLY a single JSON object without markdown formatting.`;

  const promptText = platform === 'shopify'
    ? `Please analyze the attached image and generate Shopify metadata.
Shop Style: ${shopStyle}
Product Type: Canvas / Poster

Format your response as a single, valid JSON object matching this schema:
{
  "title": "string (clean, premium title, maximum 50 characters, 4 to 6 words, no keyword stuffing)",
  "tags": ["5 to 10 relevant search tags"],
  "description_hook": "string (engaging product description snippet, max 160 characters)",
  "visual_style": ["1 to 3 style tags"],
  "occasion": [],
  "holiday": [],
  "room": ["rooms where this art fits best"]
}
CRITICAL: Return ONLY the JSON object. Do not include markdown code block formatting (like \`\`\`json).`
    : `Analyze the image of this wall art (canvas print / poster print) and return Etsy metadata JSON.
Shop Style: ${shopStyle}
Target Market: ${targetMarket}

Schema:
{
  "title": "Natural language title, UNDER 70 chars. Template: '[What you sell] – [Key Feature] – [Recipient/Room]'. Most important term at start (first 30-40 chars). NO repetitive words. NO generic gift terms.",
  "tags": ["Exactly 13 multi-word phrases. Each tag MUST BE UNDER 20 characters (maximum 19 characters, including spaces). NEVER use the word 'digital' in any tag. DO NOT repeat words from the title. Target different search intents."],
  "description": "2-3 sentences. What is sold, who it's for, why it's special. Primary keyword in first 40 chars. In English.",
  "visual_style": ["1 to 3 style tags"],
  "occasion": ["occasion tags if applicable"],
  "holiday": ["holiday tags if applicable"],
  "room": ["room tags where this art fits best"]${sectionSchemaLine}
}${sectionInstruction}
CRITICAL: No artist/brand names. Return ONLY raw JSON without markdown blocks.`;

  // Sağlayıcı bazlı deneme sırası: OpenRouter (Qwen) birincil, NVIDIA (Nemotron VL) yedek.
  // Her anahtar yalnızca kendi sağlayıcısının endpoint'ine gönderilir.
  const providerKeys = resolveProviderKeys({ openRouterKey, userApiKey, nvidiaEnvKey });
  const queueToTry = [];

  if (providerKeys.openrouter) {
    queueToTry.push({
      url: OPENROUTER_URL,
      model: "qwen/qwen3.7-plus",
      key: providerKeys.openrouter,
      isOpenRouter: true
    });
  }

  if (providerKeys.nvidia) {
    queueToTry.push({
      url: NVIDIA_URL,
      model: "nvidia/nemotron-nano-12b-v2-vl",
      key: providerKeys.nvidia,
      isOpenRouter: false
    });
  }

  if (queueToTry.length === 0) {
    throw new Error('AI anahtarı bulunamadı. Genel Ayarlar ekranından bir API anahtarı girin veya .env dosyasına OPENROUTER_API_KEY / NVIDIA_API_KEY ekleyin.');
  }

  let finalResponse = null;
  let successModel = null;
  let lastError = null;

  for (const attempt of queueToTry) {
    const payload = {
      model: attempt.model,
      max_tokens: 4096,
      temperature: 0.60, // 0.60 for creative/various SEO content
      top_p: 1.00,
      stream: false
    };

    // Disabled reasoning to save output token costs
    if (attempt.isOpenRouter && attempt.model === "qwen/qwen3.7-plus") {
      payload.reasoning = { enabled: false };
    }

    payload.messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }
    ];

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${attempt.key}`
    };

    try {
      console.log(`Attempting AI generation with model=${attempt.model} via ${attempt.url.includes("openrouter") ? "OpenRouter" : "Nvidia"}...`);
      // Wrapped in exponential backoff retry handler
      const res = await withRetry(() => axios.post(attempt.url, payload, { headers, timeout: 45000 }));
      finalResponse = res.data;
      successModel = attempt.model;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`Attempt failed with model=${attempt.model}: ${err.message}`);
    }
  }

  if (!finalResponse) {
    console.error("AI generation failed with all models and keys.");
    throw lastError || new Error("All AI generation attempts failed");
  }

  console.log(`AI generation succeeded using model=${successModel}`);

  const MODEL_PRICING = {
    "qwen/qwen3.7-plus": { input: 0.32 / 1000000, output: 1.28 / 1000000 },
    "moonshotai/kimi-k2.6": { input: 1.00 / 1000000, output: 1.00 / 1000000 },
    "minimaxai/minimax-m3": { input: 0.18 / 1000000, output: 0.18 / 1000000 },
    "nvidia/nemotron-nano-12b-v2-vl": { input: 0.07 / 1000000, output: 0.07 / 1000000 },
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": { input: 0.15 / 1000000, output: 0.15 / 1000000 }
  };

  // Token usage logging into DB
  if (finalResponse.usage) {
    try {
      const usageId = uuidv4();
      const pricing = MODEL_PRICING[successModel] || { input: 0.50 / 1000000, output: 0.50 / 1000000 };
      const promptCost = (finalResponse.usage.prompt_tokens || 0) * pricing.input;
      const completionCost = (finalResponse.usage.completion_tokens || 0) * pricing.output;
      const totalCost = promptCost + completionCost;

      const insertUsage = db.prepare(`
        INSERT INTO ai_usage (id, shop_id, model, prompt_tokens, completion_tokens, total_tokens, cost)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertUsage.run(
        usageId,
        targetShopId,
        successModel,
        finalResponse.usage.prompt_tokens || 0,
        finalResponse.usage.completion_tokens || 0,
        finalResponse.usage.total_tokens || 0,
        totalCost
      );
      console.log(`[AI Usage Logged] Model: ${successModel}, Total Tokens: ${finalResponse.usage.total_tokens}, Cost: $${totalCost.toFixed(6)}`);
    } catch (dbLogErr) {
      console.warn("Failed to log AI token usage into database:", dbLogErr.message);
    }
  }

  let assistantMsg = finalResponse.choices[0].message;
  let textResponse = assistantMsg.content.trim();

  // JSON Parsing & Single Self-Correction Retry Flow
  let parsed = null;
  const parseJsonStr = (text) => {
    let cleaned = text;
    const firstCurly = cleaned.indexOf('{');
    const lastCurly = cleaned.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
      cleaned = cleaned.substring(firstCurly, lastCurly + 1);
    } else {
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
      }
    }
    return JSON.parse(cleaned);
  };

  try {
    parsed = parseJsonStr(textResponse);
  } catch (parseErr) {
    console.warn("Initial JSON parsing failed. Attempting self-correction retry with success model...");
    // Retrieve key used for successful attempt
    const successKeyToUse = queueToTry.find(q => q.model === successModel)?.key;
    const targetUrl = queueToTry.find(q => q.model === successModel)?.url || "https://openrouter.ai/api/v1/chat/completions";

    if (successKeyToUse) {
      try {
        const retryMessages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          },
          {
            role: "assistant",
            content: assistantMsg.content,
            ...(assistantMsg.reasoning_details ? { reasoning_details: assistantMsg.reasoning_details } : {})
          },
          {
            role: "user",
            content: "Your response was not valid JSON. Please return ONLY a valid, parsable JSON object according to the requested schema. No conversational text, no formatting marks."
          }
        ];

        const retryPayload = {
          model: successModel,
          max_tokens: 4096,
          temperature: 0.20, // Low temperature for schema correctness
          top_p: 1.00,
          messages: retryMessages,
          stream: false
        };

        const retryHeaders = {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${successKeyToUse}`
        };

        const retryRes = await withRetry(() => axios.post(targetUrl, retryPayload, { headers: retryHeaders, timeout: 30000 }));
        const retryText = retryRes.data.choices[0].message.content.trim();
        parsed = parseJsonStr(retryText);
        console.log("Self-correction retry parsed successfully!");
      } catch (retryErr) {
        console.error("Self-correction JSON retry failed:", retryErr.message);
        throw new Error("API did not return valid JSON or serialization failed. Original response: " + textResponse);
      }
    } else {
      throw parseErr;
    }
  }

  // Sanitize title
  let title = parsed.title ? String(parsed.title) : '';
  title = sanitizeText(title);
  if (title.length > 140) {
    title = title.substring(0, 140).trim();
    title = title.replace(/,\s*$/, '').trim();
  }

  // Sanitize description
  let description = parsed.description || parsed.description_hook || '';
  description = sanitizeText(String(description));
  if (description.length > 5000) {
    description = description.substring(0, 5000).trim();
  }

  let descriptionHook = parsed.description_hook || parsed.description || '';
  descriptionHook = sanitizeText(String(descriptionHook));
  if (descriptionHook.length > 160) {
    descriptionHook = descriptionHook.substring(0, 160).trim();
  }

  // Sanitize tags
  let rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
  let processedTags = [];
  const seenTags = new Set();

  for (let tag of rawTags) {
    if (typeof tag !== 'string') continue;
    let cleanTag = sanitizeText(tag).trim();
    if (!cleanTag) continue;
    
    // EXCLUDE tags longer than 20 characters (prevent truncation that ruins the keyword)
    if (cleanTag.length > 20) {
      console.log(`[Tags Sanity] Excluding tag "${cleanTag}" because it exceeds 20 characters.`);
      continue;
    }
    
    // EXCLUDE tags containing the forbidden word "digital"
    if (cleanTag.toLowerCase().includes('digital')) {
      console.log(`[Tags Sanity] Excluding tag "${cleanTag}" because it contains the forbidden word "digital".`);
      continue;
    }
    
    const lowerKey = cleanTag.toLowerCase();
    if (!seenTags.has(lowerKey)) {
      seenTags.add(lowerKey);
      processedTags.push(cleanTag);
    }
  }

  const fallbackTags = [
    "wall art", "home decor", "poster print", "art print",
    "room decor", "gift idea", "interior design", "wall decor",
    "vintage wall art", "modern wall art", "chic wall decor",
    "living room art", "bedroom wall art"
  ];

  for (const fbTag of fallbackTags) {
    if (processedTags.length >= 13) break;
    const lowerKey = fbTag.toLowerCase();
    if (!seenTags.has(lowerKey)) {
      seenTags.add(lowerKey);
      processedTags.push(fbTag);
    }
  }

  processedTags = processedTags.slice(0, 13);

  const visualStyle = Array.isArray(parsed.visual_style)
    ? parsed.visual_style.map(v => sanitizeText(v).trim()).filter(Boolean).slice(0, 3)
    : [];
  const occasion = Array.isArray(parsed.occasion)
    ? parsed.occasion.map(o => sanitizeText(o).trim()).filter(Boolean)
    : [];
  const holiday = Array.isArray(parsed.holiday)
    ? parsed.holiday.map(h => sanitizeText(h).trim()).filter(Boolean)
    : [];
  const room = Array.isArray(parsed.room)
    ? parsed.room.map(r => sanitizeText(r).trim()).filter(Boolean)
    : [];

  // AI'ın seçtiği bölümü gerçek section ID'sine eşle.
  // Tam eşleşme olmazsa büyük/küçük harf ve boşluk toleranslı arama yapılır;
  // yine bulunamazsa bölüm atanmaz (uydurulmuş isim kabul edilmez).
  let chosenSection = null;
  if (usableSections.length > 0 && parsed.shop_section) {
    const want = String(parsed.shop_section).trim().toLowerCase();
    chosenSection =
      usableSections.find(s => s.title.trim().toLowerCase() === want) ||
      usableSections.find(s => s.title.trim().toLowerCase().replace(/\s+/g, '') === want.replace(/\s+/g, '')) ||
      null;

    if (!chosenSection) {
      console.warn(`[AI Section] "${parsed.shop_section}" mağaza bölümleriyle eşleşmedi, bölüm atanmadı.`);
    } else {
      console.log(`[AI Section] Seçilen bölüm: ${chosenSection.title}`);
    }
  }

  return {
    title,
    tags: processedTags,
    description,
    description_hook: descriptionHook,
    visual_style: visualStyle,
    occasion,
    holiday,
    room,
    shop_section_id: chosenSection ? chosenSection.shop_section_id : null,
    shop_section_title: chosenSection ? chosenSection.title : null,
    _meta: {
      model: successModel,
      fallbackUsed: successModel !== queueToTry[0].model
    }
  };
}

