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

export async function generateSEO(imagePath, targetMarket = "US/UK", shopStyle = "vintage poster, art deco", shopId = null, platform = "etsy") {
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
  "room": ["room tags where this art fits best"]
}
CRITICAL: No artist/brand names. Return ONLY raw JSON without markdown blocks.`;

  // Define queue list - strictly Qwen 3.7 Plus on OpenRouter
  const queueToTry = [];
  const activeKey = openRouterKey || userApiKey || nvidiaEnvKey;

  if (activeKey) {
    queueToTry.push({
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: "qwen/qwen3.7-plus",
      key: activeKey,
      isOpenRouter: true
    });
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

  return {
    title,
    tags: processedTags,
    description,
    description_hook: descriptionHook,
    visual_style: visualStyle,
    occasion,
    holiday,
    room,
    _meta: {
      model: successModel,
      fallbackUsed: false
    }
  };
}

export async function evaluateListingAI(listing, memoryBankText = '', shopId = null) {
  const targetShopId = shopId || getActiveShop().shop_id;

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

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const nvidiaEnvKey = process.env.NVIDIA_API_KEY;
  const apiKey = userApiKey || nvidiaEnvKey || openRouterKey;

  const systemPrompt = `You are a concise Etsy SEO & Product Optimization AI. Analyze listing metrics and memory bank history of analyzed listings. Return ONLY a single valid JSON object (no markdown formatting, no text before or after). Schema:
{
  "action": "OPTIMIZE" or "REPLACE",
  "reason": "Short 1-2 sentence reason for decision",
  "ai_short_note": "Very concise 1-sentence product identifier/summary for memory bank tracking",
  "suggested_title": "Improved title (max 140 chars) if OPTIMIZE, else empty string",
  "suggested_tags": ["up to 5 high-converting search tags if OPTIMIZE, else empty array"]
}`;

  const tagsStr = Array.isArray(listing.tags) ? listing.tags.join(', ') : (listing.tags || 'None');
  const userPrompt = `Listing ID: ${listing.listing_id}
Title: ${listing.title}
Section: ${listing.section_title || 'None'}
Active Days: ${listing.age_days || 0}
Views: ${listing.views || 0}, Favorites: ${listing.num_favorers || 0}, Sales: ${listing.sales_count || 0}, Revenue: $${listing.total_revenue || 0}
Price: $${listing.price_amount || 0}, Stock: ${listing.quantity || 0}
Tags: ${tagsStr}
Image Resolution: ${listing.image_width || 0}x${listing.image_height || 0} (${listing.is_high_res ? 'High Res >= 2000px' : 'LOW RES < 2000px'})

Memory Bank Context (Recently analyzed listings):
${memoryBankText ? memoryBankText.substring(0, 1000) : 'None (Memory bank is empty)'}

Evaluate whether this listing should be OPTIMIZE (improve SEO/title) or REPLACE (retire listing and swap out). If memory bank has very similar redundant listings, recommend REPLACE.`;

  let responseData = null;
  let successModel = 'moonshotai/kimi-k2.6';
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
  const payload = {
    model: successModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 1024,
    temperature: 0.3
  };

  try {
    const res = await withRetry(async () => {
      return await axios.post(invokeUrl, payload, {
        headers: {
          "Authorization": `Bearer ${nvidiaEnvKey || userApiKey || apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 25000
      });
    });
    responseData = res.data;
    if (responseData?.usage) {
      usage = responseData.usage;
    }
  } catch (err) {
    console.warn("[evaluateListingAI] Primary Nvidia API error:", err.response?.data || err.message);
    if (openRouterKey) {
      try {
        const orRes = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
          model: "meta-llama/llama-3.3-70b-instruct",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 1024
        }, {
          headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json"
          },
          timeout: 25000
        });
        responseData = orRes.data;
        successModel = 'openrouter/llama-3.3-70b-instruct';
        if (responseData?.usage) {
          usage = responseData.usage;
        }
      } catch (orErr) {
        console.error("[evaluateListingAI] OpenRouter fallback failed:", orErr.response?.data || orErr.message);
      }
    }
  }


  // Log usage to database & debug console
  console.log(`\n=================== [AI DEBUG CONSOLE] ===================`);
  console.log(`[AI Listing Evaluate] Target Listing: #${listing.listing_id} ("${listing.title.substring(0, 35)}...")`);
  console.log(`[AI Model Used]: ${successModel}`);
  console.log(`[Tokens Spent]: Prompt: ${usage.prompt_tokens || 0} | Completion: ${usage.completion_tokens || 0} | Total: ${usage.total_tokens || 0}`);
  console.log(`===========================================================\n`);

  try {
    const logStmt = db.prepare(`
      INSERT INTO ai_usage (id, shop_id, model, prompt_tokens, completion_tokens, total_tokens, cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0.0, CURRENT_TIMESTAMP)
    `);
    logStmt.run(uuidv4(), targetShopId, successModel, usage.prompt_tokens || 0, usage.completion_tokens || 0, usage.total_tokens || 0);
  } catch (logErr) {
    console.error("Failed to log ai_usage to DB:", logErr.message);
  }

  let parsed = {
    action: "OPTIMIZE",
    reason: "Analiz tamamlandı.",
    ai_short_note: `${listing.title.substring(0, 30)} (Visits: ${listing.views}, Fav: ${listing.num_favorers})`,
    suggested_title: "",
    suggested_tags: []
  };

  if (responseData?.choices?.[0]?.message?.content) {
    const rawContent = responseData.choices[0].message.content.trim();
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const jsonParsed = JSON.parse(jsonMatch[0]);
        parsed = { ...parsed, ...jsonParsed };
      } catch (e) {
        console.warn("Could not parse AI response JSON:", e.message);
      }
    }
  }

  return {
    listing_id: listing.listing_id,
    action: parsed.action?.toUpperCase() === 'REPLACE' ? 'REPLACE' : 'OPTIMIZE',
    reason: parsed.reason || 'Metrikler ve hafıza bankası değerlendirildi.',
    ai_short_note: parsed.ai_short_note || `${listing.title.substring(0, 40)}`,
    suggested_title: parsed.suggested_title || '',
    suggested_tags: Array.isArray(parsed.suggested_tags) ? parsed.suggested_tags : [],
    token_usage: {
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      model: successModel
    }
  };
}

