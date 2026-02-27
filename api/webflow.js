/**
 * Vercel Serverless Function
 * Route: /api/webflow
 *
 * What it does:
 * - Fetches live items from Webflow collection "Blogs"
 * - Fetches collection schema to translate Option field IDs -> human labels
 * - Returns "clean" items with label fields Lovable can display directly:
 *   formatLabel, categoryLabel, industryLabel, languageLabel, typeOfResourcesLabel
 *
 * Safe defaults:
 * - categoryLabel fallback: "General"
 * - formatLabel fallback: "Resource"
 * - industryLabel fallback: "Cross-Industry"
 */

const COLLECTION_ID = "65e1ce3530fd753ef9a25bf8";
const WEBFLOW_API_BASE = "https://api.webflow.com/v2";

// --- small in-memory cache (works fine on Vercel warm instances) ---
let schemaCache = {
  expiresAt: 0,
  optionMapsBySlug: {}, // { [fieldSlug]: { [optionId]: optionName } }
};

function setCors(req, res) {
  const origin = req.headers.origin || "*";

  // Allow Lovable preview + your domains + local dev
  const allowList = [
    /^https:\/\/.*\.lovable\.app$/,
    /^https:\/\/.*\.lovableproject\.com$/,
    /^https:\/\/lovable\.dev$/,
    /^https:\/\/.*\.vercel\.app$/,
    /^https:\/\/(www\.)?p2sconsulting\.com$/,
    /^https:\/\/(www\.)?p2s\.be$/,
    /^http:\/\/localhost:\d+$/,
  ];

  const allowed =
    origin === "*" || allowList.some((re) => re.test(origin)) ? origin : "*";

  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Vary", "Origin");
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
  // collection.fields[] contains Option fields with validations.options[]
  const maps = {};

  const fields = Array.isArray(collection?.fields) ? collection.fields : [];
  for (const f of fields) {
    if (f?.type !== "Option") continue;
    const slug = f?.slug;
    const options = f?.validations?.options || [];
    if (!slug || !Array.isArray(options)) continue;

    maps[slug] = {};
    for (const opt of options) {
      if (opt?.id && opt?.name) {
        maps[slug][opt.id] = opt.name;
      }
    }
  }

  return maps;
}

function pickFieldSlug(fieldData, candidates) {
  // exact match first
  for (const c of candidates) {
    if (fieldData && Object.prototype.hasOwnProperty.call(fieldData, c)) return c;
  }

  // fuzzy match (case-insensitive contains)
  const keys = Object.keys(fieldData || {});
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

  // value can be: optionId string, null, undefined, or array (multi-ref not option, but safe)
  if (!value) return null;

  if (Array.isArray(value)) {
    // If Webflow option ever becomes multi-select, convert to labels
    const labels = value.map((v) => map[v] || null).filter(Boolean);
    return labels.length ? labels.join(", ") : null;
  }

  return map[value] || null;
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: true, message: "Only GET is supported" });

  try {
    const token = process.env.WEBFLOW_API_TOKEN;
    if (!token) {
      return res.status(500).json({
        error: true,
        message: "WEBFLOW_API_TOKEN not found in Vercel environment variables",
      });
    }

    // 1) Fetch items (live)
    const itemsData = await webflowFetch(
      `/collections/${COLLECTION_ID}/items/live`,
      token
    );

    const items = Array.isArray(itemsData?.items) ? itemsData.items : [];

    // 2) Fetch collection schema (cached for 1 hour)
    const now = Date.now();
    if (!schemaCache.expiresAt || now > schemaCache.expiresAt) {
      const collection = await webflowFetch(`/collections/${COLLECTION_ID}`, token);
      schemaCache.optionMapsBySlug = buildOptionMapsFromCollectionSchema(collection);
      schemaCache.expiresAt = now + 60 * 60 * 1000;
    }

    const optionMapsBySlug = schemaCache.optionMapsBySlug || {};

    // 3) Determine which field slugs correspond to your tags
    // We detect them automatically from existing fieldData keys.
    // If your slugs are exactly "format", "category", "industry" this will find them.
    // If they are "format-2" etc, this still finds them by contains-match.
    const sampleFieldData = items[0]?.fieldData || {};

    const formatSlug = pickFieldSlug(sampleFieldData, [
      "format",
      "formats",
      "resource-format",
      "format-of-resource",
    ]);

    const categorySlug = pickFieldSlug(sampleFieldData, [
      "category",
      "categories",
      "resource-category",
    ]);

    const industrySlug = pickFieldSlug(sampleFieldData, [
      "industry",
      "industries",
      "industry-tag",
    ]);

    // keep existing Webflow field too (you had this earlier)
    const typeOfResourcesSlug = pickFieldSlug(sampleFieldData, [
      "type-of-resources",
      "type",
    ]);

    const languageSlug = pickFieldSlug(sampleFieldData, ["language"]);

    // 4) Build cleaned response
    const cleaned = items.map((it) => {
      const fd = it.fieldData || {};

      const formatId = formatSlug ? fd[formatSlug] : null;
      const categoryId = categorySlug ? fd[categorySlug] : null;
      const industryId = industrySlug ? fd[industrySlug] : null;

      const formatLabel =
        optionLabel(optionMapsBySlug, formatSlug, formatId) || "Resource";

      const categoryLabel =
        optionLabel(optionMapsBySlug, categorySlug, categoryId) || "General";

      const industryLabel =
        optionLabel(optionMapsBySlug, industrySlug, industryId) || "Cross-Industry";

      const languageLabel =
        optionLabel(optionMapsBySlug, languageSlug, fd[languageSlug]) ||
        null;

      // IMPORTANT: type-of-resources is NOT your "Format" tag, but we still expose it separately in case you need it
      const typeOfResourcesLabel =
        optionLabel(optionMapsBySlug, typeOfResourcesSlug, fd[typeOfResourcesSlug]) ||
        null;

      return {
        id: it.id,
        slug: fd.slug || it.slug || "",
        name: fd.name || "",
        h1: fd.h1 || "",
        metaDescription: fd["meta-description"] || fd.metaDescription || "",
        content: fd.content || "",
        thumbnail: fd.thumbnail || null,
        mainImage: fd["main-image"] || null,
        video: fd.video || null,
        file: fd.file || null,
        websiteUrl: fd["website-url"] || null,
        author: fd["author-s"] || [],
        requireFormSubmission: !!fd["require-form-submission"],

        // ✅ The only three tags Lovable should display
        formatLabel,
        categoryLabel,
        industryLabel,

        // Extra info (optional)
        language: fd.language || null,
        languageLabel,
        typeOfResources: fd["type-of-resources"] || null,
        typeOfResourcesLabel,
      };
    });

    return res.status(200).json({
      ok: true,
      detectedFieldSlugs: {
        formatSlug,
        categorySlug,
        industrySlug,
        // exposed for transparency/debugging
        typeOfResourcesSlug,
        languageSlug,
      },
      items: cleaned,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: true,
      message: err.message || "Server crashed",
      details: err.details || null,
    });
  }
}
