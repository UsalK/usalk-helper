import axios from 'axios';
import fs from 'fs';
import db from '../db/db.js';
import { Jimp } from 'jimp';

const metaAPI = "meta/llama-3.2-90b-vision-instruct";
const kimiAPI = "moonshotai/kimi-k2.6";

const DEFAULT_API_KEY = "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";
const DEFAULT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "moonshotai/kimi-k2.6"; // Set to moonshotai/kimi-k2.6 as requested

const artistReplacements = [
  { pattern: /alphonse\s+mucha/gi, replacement: "Art Nouveau" },
  { pattern: /\bmucha\b/gi, replacement: "Art Nouveau" },
  { pattern: /gustav\s+klimt/gi, replacement: "Jugendstil" },
  { pattern: /\bklimt\b/gi, replacement: "Jugendstil" },
  { pattern: /vincent\s+van\s+gogh/gi, replacement: "Impressionist" },
  { pattern: /van\s+gogh/gi, replacement: "Impressionist" },
  { pattern: /claude\s+monet/gi, replacement: "Impressionist" },
  { pattern: /\bmonet\b/gi, replacement: "Impressionist" },
  { pattern: /william\s+morris/gi, replacement: "Arts and Crafts" },
  { pattern: /\bmorris\b/gi, replacement: "Arts and Crafts" },
  { pattern: /pablo\s+picasso/gi, replacement: "Cubist" },
  { pattern: /\bpicasso\b/gi, replacement: "Cubist" },
  { pattern: /henri\s+matisse/gi, replacement: "Fauvist" },
  { pattern: /\bmatisse\b/gi, replacement: "Fauvist" },
  { pattern: /salvador\s+dali/gi, replacement: "Surrealist" },
  { pattern: /\bdali\b/gi, replacement: "Surrealist" },
  { pattern: /andy\s+warhol/gi, replacement: "Pop Art" },
  { pattern: /\bwarhol\b/gi, replacement: "Pop Art" },
  { pattern: /roy\s+lichtenstein/gi, replacement: "Pop Art" },
  { pattern: /\blichtenstein\b/gi, replacement: "Pop Art" },
  { pattern: /edward\s+hopper/gi, replacement: "Realist" },
  { pattern: /\bhopper\b/gi, replacement: "Realist" },
  { pattern: /keith\s+haring/gi, replacement: "Street Art" },
  { pattern: /\bharing\b/gi, replacement: "Street Art" },
  { pattern: /jean[- ]michel\s+basquiat/gi, replacement: "Neo-Expressionist" },
  { pattern: /\bbasquiat\b/gi, replacement: "Neo-Expressionist" },
  { pattern: /yayoi\s+kusama/gi, replacement: "Contemporary" },
  { pattern: /\bkusama\b/gi, replacement: "Contemporary" },
  { pattern: /frida\s+kahlo/gi, replacement: "Surrealist" },
  { pattern: /\bkahlo\b/gi, replacement: "Surrealist" },
  { pattern: /georgia\s+o'keeffe/gi, replacement: "Modernist" },
  { pattern: /\bo'keeffe\b/gi, replacement: "Modernist" },
  { pattern: /wassily\s+kandinsky/gi, replacement: "Abstract Art" },
  { pattern: /\bkandinsky\b/gi, replacement: "Abstract Art" },
  { pattern: /piet\s+mondrian/gi, replacement: "Abstract Art" },
  { pattern: /\bmondrian\b/gi, replacement: "Abstract Art" },
  { pattern: /rene\s+magritte/gi, replacement: "Surrealist" },
  { pattern: /\bmagritte\b/gi, replacement: "Surrealist" },
  { pattern: /marc\s+chagall/gi, replacement: "Modernist" },
  { pattern: /\bchagall\b/gi, replacement: "Modernist" },
  { pattern: /jackson\s+pollock/gi, replacement: "Abstract Expressionist" },
  { pattern: /\bpollock\b/gi, replacement: "Abstract Expressionist" },
  { pattern: /\bbanksy\b/gi, replacement: "Graffiti Art" },
  { pattern: /rembrandt/gi, replacement: "Baroque" },
  { pattern: /da\s+vinci/gi, replacement: "Renaissance" },
  { pattern: /michelangelo/gi, replacement: "Renaissance" },
  { pattern: /\b(disney|marvel|star\s+wars|pokemon|pikachu|mickey\s+mouse|harry\s+potter|barbie)\b/gi, replacement: "Fantasy Art" },
  { pattern: /\b(nike|adidas|gucci|chanel|prada|louis\s+vuitton)\b/gi, replacement: "Luxury Style" }
];

function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  let sanitized = text;
  for (const { pattern, replacement } of artistReplacements) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  // Remove double spaces and clean whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  // Clean up duplicate commas or trailing/leading punctuation
  sanitized = sanitized.replace(/,\s*,/g, ',').replace(/\s*,\s*/g, ', ');
  return sanitized;
}

export async function generateSEO(imagePath, targetMarket = "US/UK", shopStyle = "vintage poster, art deco", isDigital = false) {
  let apiKey = process.env.NVIDIA_API_KEY || DEFAULT_API_KEY;
  let url = DEFAULT_URL;

  if (!process.env.NVIDIA_API_KEY) {
    try {
      const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
      const setting = stmt.get('nvidia_api_key');
      if (setting) {
        apiKey = JSON.parse(setting.value);
      }
    } catch (err) {
      console.error("Error reading api key from db, using default:", err);
    }
  }

  // Load and resize the image file using Jimp to avoid payload size errors (400 Bad Request)
  const imageBuffer = fs.readFileSync(imagePath);
  const image = await Jimp.read(imageBuffer);
  if (image.width > 1024) {
    image.resize({ w: 1024 });
  }
  const isPng = imagePath.toLowerCase().endsWith('.png');
  const isWebp = imagePath.toLowerCase().endsWith('.webp');
  const mimeType = isPng ? 'image/png' : (isWebp ? 'image/webp' : 'image/jpeg');
  const dataUrl = await image.getBase64(mimeType);

  const systemPrompt = isDigital
    ? `You are an Etsy SEO expert for instant digital download art and printable wall art listing optimization.
Analyze the provided artwork image and generate highly optimized, high-converting Etsy listing metadata focusing on search engine optimization (SEO) and search visibility for printable digital downloads.

Your primary goal is to interpret and comment on the uploaded artwork thumbnail, describing its visual elements, style, subject matter, colors, and mood. This visual analysis will form the basis of a detailed long description.

CRITICAL ETSY POLICY & COPYRIGHT RULES:
- STRICTLY FORBIDDEN: Do not mention any specific artist names (e.g. Alphonse Mucha, Gustav Klimt, Vincent van Gogh, Claude Monet, William Morris, Pablo Picasso, Henri Matisse, Salvador Dali, Andy Warhol, Rembrandt, da Vinci, Michelangelo, etc.). Instead, describe the style generically (e.g., use "Art Nouveau Style", "Impressionist Style", "Arts & Crafts Style", "Modernism", "Surrealism", "Pop Art", "Baroque", "Renaissance Style", etc.).
- STRICTLY FORBIDDEN: Do not include trademarked brand names (e.g., Disney, Marvel, Harry Potter, Nike, Gucci, etc.) or celebrity names/pop culture figures.
- Only describe the visual elements, style, and mood using generic descriptions. Never use copyrighted characters or brands.

OUTPUT FORMAT:
You must output a single JSON object. Do not include any markdown wrappers (like \`\`\`json), prefix, or suffix. Your output must start with '{' and end with '}'.

CRITICAL CONSTRAINTS:
1. "title" must be a string and MUST NOT exceed 140 characters. It must contain high-search-volume SEO keywords separated by commas, specifically tailored to printable/digital download art (e.g., 'Printable Wall Art', 'Digital Download Art', 'Instant Download', 'Printable Poster', etc.) combined with keywords describing the image content. Do not include specific artist or brand names.
2. "tags" MUST be an array of EXACTLY 13 strings. Each tag MUST NOT exceed 20 characters. The tags must be high-traffic Etsy SEO keywords/phrases. At least 5 tags must be digital-specific (e.g. 'printable wall art', 'digital download', 'instant download', 'digital print', 'printable poster', 'printable art', etc.). Do not repeat tags. Each tag must be safe and not contain specific artist names or brand names.
3. "description" must be a string. It must be a clean, readable, and structured description (avoiding long, overwhelming walls of text). First, write a short and concise introduction describing the visual subject, style, and colors (1 paragraph, max 3-4 sentences). Second, explain the digital download delivery clearly (instant access, no physical shipment). Third, provide standard printing size guidelines (e.g., 2:3, 3:4, 4:5, 11x14, ISO ratios) using clear formatting.
4. "visual_style" must be an array of 1 to 3 strings.
5. "occasion" must be an array of strings (leave empty if not applicable).
6. "holiday" must be an array of strings (leave empty if not applicable).
7. "room" must be an array of room tags.`
    : `You are an Etsy SEO expert for print-on-demand wall art listing optimization.
Analyze the provided artwork image and generate highly optimized, high-converting Etsy listing metadata focusing on search engine optimization (SEO) and search visibility.

CRITICAL ETSY POLICY & COPYRIGHT RULES:
- STRICTLY FORBIDDEN: Do not mention any specific artist names (e.g. Alphonse Mucha, Gustav Klimt, Vincent van Gogh, Claude Monet, William Morris, Pablo Picasso, Henri Matisse, Salvador Dali, Andy Warhol, Rembrandt, da Vinci, Michelangelo, etc.). Instead, describe the style generically (e.g., use "Art Nouveau Style", "Impressionist Style", "Arts & Crafts Style", "Modernism", "Surrealism", "Pop Art", "Baroque", "Renaissance Style", etc.).
- STRICTLY FORBIDDEN: Do not include trademarked brand names (e.g., Disney, Marvel, Harry Potter, Nike, Gucci, etc.) or celebrity names/pop culture figures.
- Only describe the visual elements, style, and mood using generic descriptions. Never use copyrighted characters or brands.

OUTPUT FORMAT:
You must output a single JSON object. Do not include any markdown wrappers (like \`\`\`json), prefix, or suffix. Your output must start with '{' and end with '}'.

CRITICAL CONSTRAINTS:
1. "title" must be a string and MUST NOT exceed 140 characters. It must contain high-search-volume SEO keywords separated by commas. Do not include specific artist or brand names.
2. "tags" MUST be an array of EXACTLY 13 strings. Each tag MUST NOT exceed 20 characters. The tags must be high-traffic Etsy SEO keywords/phrases. Do not repeat tags. Each tag must be safe and not contain specific artist names or brand names.
3. "description_hook" must be a string and MUST NOT exceed 160 characters. It should be an engaging, search-optimized snippet featuring primary keywords (no specific artist or brand names).
4. "visual_style" must be an array of 1 to 3 strings.
5. "occasion" must be an array of strings (leave empty if not applicable).
6. "holiday" must be an array of strings (leave empty if not applicable).
7. "room" must be an array of room tags.`;

  const userPrompt = isDigital
    ? {
        task: "etsy_digital_seo_optimization",
        shop_style: shopStyle,
        target_market: targetMarket,
        product_type: "digital download / printable wall art",
        instructions: "Generate Etsy listing details specifically for a digital download product. Analyze the uploaded thumbnail image to describe the visual content in a short, concise paragraph (max 3-4 sentences). The description should be clean, structured, and easy to read, avoiding long walls of text. Include digital download details and printing size guidelines. Return EXACTLY 13 tags of maximum 20 characters each. Absolutely no artist or brand names.",
        output_schema: {
          title: "string (max 140 chars, high-search-volume keywords separated by commas, containing digital art phrases)",
          tags: ["array of EXACTLY 13 strings, each string max 20 chars, containing digital keywords like digital download, printable art, etc."],
          description: "string (long description, detailed visual analysis of the artwork followed by instant download printing instructions)",
          visual_style: ["array of 1-3 strings representing visual style tags"],
          occasion: ["array of occasion tags if applicable"],
          holiday: ["array of holiday tags if applicable"],
          room: ["array of room tags where this art fits best"]
        }
      }
    : {
        task: "etsy_seo_optimization",
        shop_style: shopStyle,
        target_market: targetMarket,
        product_type: "canvas print / poster print",
        instructions: "Generate Etsy SEO listing details focusing on search rankings. Ensure character limits and count restrictions are strictly followed. Do not exceed 140 characters for title, and return EXACTLY 13 tags of maximum 20 characters each. Ensure absolute compliance with copyright rules: do not use artist names or brand names. Use generic style descriptors.",
        output_schema: {
          title: "string (max 140 chars, high-search-volume keywords separated by commas)",
          tags: ["array of EXACTLY 13 strings, each string must be maximum 20 characters, mix of long-tail and broad keywords for Etsy SEO"],
          description_hook: "string (first 160 characters, highly descriptive and appealing search snippet)",
          visual_style: ["array of 1-3 strings representing visual style tags"],
          occasion: ["array of occasion tags if applicable"],
          holiday: ["array of holiday tags if applicable"],
          room: ["array of room tags where this art fits best (e.g. living room, bedroom)"]
        }
      };

  const payload = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify(userPrompt)
          },
          {
            type: "image_url",
            image_url: {
              url: dataUrl
            }
          }
        ]
      }
    ],
    max_tokens: 1024,
    temperature: 0.20,
    top_p: 1.00,
    stream: false
  };

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json"
  };

  const response = await axios.post(url, payload, { headers });

  if (!response.data || !response.data.choices || response.data.choices.length === 0) {
    throw new Error("Invalid response from Nvidia Kimi API");
  }

  let textResponse = response.data.choices[0].message.content.trim();

  // Robust extraction of JSON object from the response text
  const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    textResponse = jsonMatch[0];
  } else {
    // Clean potential markdown wrappers if regex match failed
    if (textResponse.startsWith("```json")) {
      textResponse = textResponse.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (textResponse.startsWith("```")) {
      textResponse = textResponse.replace(/^```/, "").replace(/```$/, "").trim();
    }
  }

  try {
    const parsed = JSON.parse(textResponse);

    // 1. Sanitize and validate title
    let title = parsed.title ? String(parsed.title) : '';
    title = sanitizeText(title);
    if (title.length > 140) {
      title = title.substring(0, 140).trim();
      title = title.replace(/,\s*$/, '').trim(); // Remove trailing commas or partial commas
    }

    // 2. Sanitize and validate description (long or hook depending on isDigital)
    let description = parsed.description || parsed.description_hook || parsed.description_hook || '';
    description = sanitizeText(String(description));
    if (isDigital) {
      if (description.length > 3000) {
        description = description.substring(0, 3000).trim();
      }
    } else {
      if (description.length > 160) {
        description = description.substring(0, 160).trim();
      }
    }

    // 3. Sanitize and validate tags (max 20 chars per tag, exactly 13 tags, no repeats)
    let rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
    let processedTags = [];
    const seenTags = new Set();

    for (let tag of rawTags) {
      if (typeof tag !== 'string') continue;
      let cleanTag = sanitizeText(tag).trim();
      if (!cleanTag) continue;
      if (cleanTag.length > 20) {
        cleanTag = cleanTag.substring(0, 20).trim();
      }
      const lowerKey = cleanTag.toLowerCase();
      if (!seenTags.has(lowerKey)) {
        seenTags.add(lowerKey);
        processedTags.push(cleanTag);
      }
    }

    // Default safe Etsy tags to backfill if we have fewer than 13 tags
    const fallbackTags = isDigital
      ? [
          "digital download",
          "printable wall art",
          "instant download",
          "digital print",
          "printable poster",
          "printable art",
          "wall art",
          "home decor",
          "digital poster",
          "room decor",
          "printable decor",
          "boho digital art",
          "modern printable"
        ]
      : [
          "wall art",
          "home decor",
          "poster print",
          "art print",
          "room decor",
          "gift idea",
          "interior design",
          "wall decor",
          "vintage wall art",
          "modern wall art",
          "chic wall decor",
          "living room art",
          "bedroom wall art"
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

    // 4. Sanitize other metadata lists
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
      description_hook: isDigital ? description.substring(0, 160) : description,
      visual_style: visualStyle,
      occasion,
      holiday,
      room
    };
  } catch (err) {
    console.error("Failed to parse or sanitize JSON from Kimi API:", textResponse, err);
    throw new Error("API did not return valid JSON or serialization failed. Response: " + textResponse);
  }
}
