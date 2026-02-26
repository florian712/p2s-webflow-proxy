// api/webflow.js
// Vercel Serverless Function (Node runtime)

const WEBFLOW_API_BASE = "https://api.webflow.com/v2";

// ✅ Your IDs
const BLOG_COLLECTION_ID = process.env.BLOG_COLLECTION_ID || "65e1ce3530fd753ef9a25bf8";
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || "63c573b5f0d6b8cb2b057141";

function isAllowedOrigin(origin) {
  if (!origin) return false;

  // ✅ allow your prod domains + lovable preview domains
  const allowed = [
    "https://p2sconsulting.com",
    "https://www.p2sconsulting.com",
    "https://p2s.be",
    "https://www.p2s.be",
  ];

  // allow any lovable preview subdomain
  const lovablePreview = /^https:\/\/id-preview--.+\.lovable\.app$/i;
  const lovableMain = /^https:\/\/.+\.lovable\.app$/i;

  return allowed.includes(origin) || lovablePreview.test(origin) || lovableMain.test(origin);
}

function setCors(res, origin) {
  // If origin is allowed, reflect it back
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, accept-version");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function webflowFetch(path) {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error("Missing WEBFLOW_API_TOKEN env var");

  const url = `${WEBFLOW_API_BASE}${path}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "accept-version": "2.0.0",
      "Content-Type": "application/json",
    },
  });

  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!resp.ok) {
    const msg = json?.message || json?.error || text || `Webflow error ${resp.status}`;
    throw new Error(msg);
  }

  return json;
}

// Build option maps from collection schema:
// optionMaps[fieldSlug][optionId] = optionName
async function buildOptionMaps(collectionId) {
  const collection = await webflowFetch(`/collections/${collectionId}`);
  const fields = collection?.fields || [];
  const optionMaps = {};

  for (const f of fields) {
    if (f?.type === "Option" && f?.slug && f?.validations?.options) {
      optionMaps[f.slug] = {};
      for (const opt of f.validations.options) {
        optionMaps[f.slug][opt.id] = opt.name;
      }
    }
  }

  return optionMaps;
}

function resolveOption(optionMaps, fieldSlug, value) {
  if (!value) return null;
  const map = optionMaps?.[fieldSlug];
  if (!map) return value; // if not in map, keep raw
  return map[value] || value;
}

// Transform item into the “clean JSON” Lovable should consume
function transformBlogItem(item, optionMaps) {
  const fd = item.fieldData || {};

  // IMPORTANT:
  // - Your collection has option fields (ids). We resolve them to their labels here.
  // - If some fields don’t exist yet, leaving them null is fine.

  const clean = {
    id: item.id,
    createdOn: item.createdOn,
    lastPublished: item.lastPublished,
    lastUpdated: item.lastUpdated,

    // Core
    title: fd.name || null,
    slug: fd.slug || null,

    // SEO
    h1: fd.h1 || fd.name || null,
    metaDescription: fd["meta-description"] || null,

    // Media/content
    thumbnail: fd.thumbnail?.url ? { url: fd.thumbnail.url, alt: fd.thumbnail.alt || null } : null,
    mainImage: fd["main-image"]?.url ? { url: fd["main-image"].url, alt: fd["main-image"].alt || null } : null,
    contentHtml: fd.content || null,
    video: fd.video?.url
      ? {
          url: fd.video.url,
          // keep metadata but it can be large; Lovable can ignore if it wants
          metadata: fd.video.metadata || null,
        }
      : null,

    // Attachments / external
    file: fd.file?.url
      ? { url: fd.file.url, fileId: fd.file.fileId || null, filename: fd.file?.name || null }
      : null,
    websiteUrl: fd["website-url"] || null,

    // Filters/tags (resolve option IDs → human labels)
    typeOfResources: resolveOption(optionMaps, "type-of-resources", fd["type-of-resources"]),
    language: resolveOption(optionMaps, "language", fd.language),

    // If you added these as Option fields in Webflow, the proxy will resolve them too automatically:
    category: resolveOption(optionMaps, "category", fd.category),
    format: resolveOption(optionMaps, "format", fd.format),
    industry: resolveOption(optionMaps, "industry", fd.industry),

    // reading time: if your field exists as "reading-time" or similar, copy it here
    readingTime: fd["reading-time"] || null,

    // authors: keep raw IDs for now; you can enrich later (team CSV / another endpoint)
    authorIds: Array.isArray(fd["author-s"]) ? fd["author-s"] : [],
  };

  return clean;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  setCors(res, origin);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // Query params
    const slug = req.query?.slug ? String(req.query.slug) : null;
    const limit = req.query?.limit ? parseInt(String(req.query.limit), 10) : null;

    // 1) build option maps
    const optionMaps = await buildOptionMaps(BLOG_COLLECTION_ID);

    // 2) fetch live items
    const data = await webflowFetch(`/collections/${BLOG_COLLECTION_ID}/items/live`);
    let items = (data.items || []).map((item) => transformBlogItem(item, optionMaps));

    // 3) filter by slug (this fixes “every link opens latest post”)
    if (slug) {
      items = items.filter((x) => x.slug === slug);
    }

    // 4) optional limit
    if (limit && Number.isFinite(limit)) {
      items = items.slice(0, limit);
    }

    return res.status(200).json({
      items,
      meta: {
        collectionId: BLOG_COLLECTION_ID,
        siteId: WEBFLOW_SITE_ID,
        count: items.length,
        filteredBySlug: slug || null,
      },
    });
  } catch (err) {
    // Always include CORS headers even on error
    setCors(res, origin);

    return res.status(500).json({
      error: true,
      message: err?.message || "Internal Server Error",
    });
  }
}
