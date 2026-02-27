/**
 * Vercel Serverless Function
 * Route: /api/webflow
 *
 * IMPORTANT: Response shape is exactly:
 *   { items: [...] }
 * to avoid breaking Lovable’s existing fetch/parser logic.
 *
 * Adds resolved labels:
 *   formatLabel, categoryLabel, industryLabel
 *
 * Fallbacks:
 *   categoryLabel: "General"
 *   formatLabel: "Resource"
 *   industryLabel: "Cross-Industry"
 */

const COLLECTION_ID = "65e1ce3530fd753ef9a25bf8";
const WEBFLOW_API_BASE = "https://api.webflow.com/v2";

// Simple cache for schema mapping (warm instances)
let cached = {
  expiresAt: 0,
  optionMapsBySlug: {},
};

function setCors(req, res) {
  // Safest for now while debugging
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, accept-version"
  );
}

async function webflowFetch(path, token) {
  const resp = await fetch(`${WEBFLOW_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "accept-version": "2.0.0",
    },
  });

  const text = await resp.text();

  if (!resp.ok) {
    const err = new Error(`Webflow API error ${resp.status}`);
    err.status = resp.status;
    err.details = text;
    throw err;
  }

  return JSON.parse(text);
}

function buildOptionMapsFromCollectionSchema(collection) {
  const maps = {};
  const fields = Array.isArray(collection?.fields) ? collection.fields : [];

  for (const f of fields) {
    if (f?.type !== "Option") continue;
    const slug = f?.slug;
    const options = f?.validations?.options || [];
    if (!slug || !Array.isArray(options)) continue;

    maps[slug] = {};
    for (const opt of options) {
      if (opt?.id && opt?.name) maps[slug][opt.id] = opt.name;
    }
  }

  return maps;
}

function pickFieldSlug(fieldData, candidates) {
  if (!fieldData) return null;

  // exact match first
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(fieldData, c)) return c;
  }

  // fuzzy match
  const keys = Object.keys(fieldData);
  for (const c of candidates) {
    const lc = c.toLowerCase();
    const found = keys.find((k) => k.toLowerCase() === lc);
    if (found) return found;
  }
  for (const c of candidates) {
    const lc = c.toLowerCase();
    const found = keys.find((k) => k.toLowerCase().includes(lc));
    if (found) return found;
  }

  return null;
}

function optionLabel(optionMapsBySlug, fieldSlug, value) {
  if (!fieldSlug) return null;
  const map = optionMapsBySlug?.[fieldSlug] || {};
  if (!value) return null;
  if (Array.isArray(value)) return null; // not expected for Option, but safe
  return map[value] || null;
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: true, message: "Only GET is supported" });
  }

  try {
    const token = process.env.WEBFLOW_API_TOKEN;
    if (!token) {
      return res.status(500).json({
        error: true,
        message: "WEBFLOW_API_TOKEN not found in Vercel environment variables",
      });
    }

    // 1) Fetch live items
    const itemsData = await webflowFetch(
      `/collections/${COLLECTION_ID}/items/live`,
      token
    );
    const items = Array.isArray(itemsData?.items) ? itemsData.items : [];

    // 2) Fetch schema (cached 1 hour)
    const now = Date.now();
    if (!cached.expiresAt || now > cached.expiresAt) {
      const collection = await webflowFetch(`/collections/${COLLECTION_ID}`, token);
      cached.optionMapsBySlug = buildOptionMapsFromCollectionSchema(collection);
      cached.expiresAt = now + 60 * 60 * 1000;
    }

    const optionMapsBySlug = cached.optionMapsBySlug || {};
    const sampleFieldData = items[0]?.fieldData || {};

    // 3) Detect your option field slugs (category/format/industry)
    // NOTE: We DO NOT use "type-of-resources" for these tags.
    const formatSlug = pickFieldSlug(sampleFieldData, ["format", "resource-format"]);
    const categorySlug = pickFieldSlug(sampleFieldData, ["category", "categories"]);
    const industrySlug = pickFieldSlug(sampleFieldData, ["industry", "industries"]);

    // 4) Clean + add labels but keep all existing fields you already rely on
    const cleaned = items.map((it) => {
      const fd = it.fieldData || {};

      const formatId = formatSlug ? fd[formatSlug] : null;
      const categoryId = categorySlug ? fd[categorySlug] : null;
      const industryId = industrySlug ? fd[industrySlug] : null;

      const formatLabel = optionLabel(optionMapsBySlug, formatSlug, formatId) || "Resource";
      const categoryLabel = optionLabel(optionMapsBySlug, categorySlug, categoryId) || "General";
      const industryLabel = optionLabel(optionMapsBySlug, industrySlug, industryId) || "Cross-Industry";

      return {
        // Keep what Lovable expects
        id: it.id,
        slug: fd.slug || it.slug || "",
        name: fd.name || "",
        h1: fd.h1 || "",
        metaDescription: fd["meta-description"] || "",
        content: fd.content || "",
        thumbnail: fd.thumbnail || null,
        mainImage: fd["main-image"] || null,
        video: fd.video || null,
        file: fd.file || null,
        websiteUrl: fd["website-url"] || null,
        author: fd["author-s"] || [],
        requireFormSubmission: !!fd["require-form-submission"],
        language: fd.language || null,

        // ✅ These are the tags Lovable should show
        formatLabel,
        categoryLabel,
        industryLabel,

        // Optional: expose raw IDs too (helpful for debugging)
        formatId: formatId || null,
        categoryId: categoryId || null,
        industryId: industryId || null,
      };
    });

    // IMPORTANT: return EXACTLY { items: [...] }
    return res.status(200).json({ items: cleaned });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: true,
      message: err.message || "Server crashed",
      details: err.details || null,
    });
  }
}
