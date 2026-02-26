// api/webflow.js
// Stable production-safe Webflow proxy

const WEBFLOW_API_BASE = "https://api.webflow.com/v2";

const BLOG_COLLECTION_ID = process.env.BLOG_COLLECTION_ID;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID;
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;

// ---------- CORS ----------

function setCors(res, origin) {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ---------- Webflow Fetch ----------

async function webflowFetch(path) {
  if (!WEBFLOW_API_TOKEN) {
    throw new Error("Missing WEBFLOW_API_TOKEN");
  }

  const response = await fetch(`${WEBFLOW_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
      "accept-version": "2.0.0",
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  let json;

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(json?.message || "Webflow API error");
  }

  return json;
}

// ---------- Transform ----------

function transformItem(item) {
  const fd = item.fieldData || {};

  return {
    id: item.id,
    createdOn: item.createdOn,
    lastPublished: item.lastPublished,

    // Core
    title: fd.name || null,
    slug: fd.slug || null,

    // SEO
    h1: fd.h1 || fd.name || null,
    metaDescription: fd["meta-description"] || null,

    // Content
    contentHtml: fd.content || null,

    // Media
    thumbnail: fd.thumbnail?.url
      ? { url: fd.thumbnail.url, alt: fd.thumbnail.alt || null }
      : null,

    mainImage: fd["main-image"]?.url
      ? { url: fd["main-image"].url, alt: fd["main-image"].alt || null }
      : null,

    video: fd.video?.url
      ? { url: fd.video.url, metadata: fd.video.metadata || null }
      : null,

    file: fd.file?.url
      ? { url: fd.file.url }
      : null,

    websiteUrl: fd["website-url"] || null,

    // Safe fallback defaults
    category: fd.category || "General",
    format: fd.format || "Resource",
    industry: fd.industry || "Cross-Industry",

    readingTime: fd["reading-time"] || null,

    authors: Array.isArray(fd["author-s"]) ? fd["author-s"] : [],
  };
}

// ---------- Handler ----------

export default async function handler(req, res) {
  const origin = req.headers.origin;
  setCors(res, origin);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const slug = req.query?.slug || null;
    const limit = req.query?.limit ? parseInt(req.query.limit, 10) : null;

    const data = await webflowFetch(
      `/collections/${BLOG_COLLECTION_ID}/items/live`
    );

    let items = (data.items || []).map(transformItem);

    // Slug filter (CRITICAL FIX)
    if (slug) {
      items = items.filter((x) => x.slug === slug);
    }

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
  } catch (error) {
    setCors(res, origin);

    return res.status(500).json({
      error: true,
      message: error.message || "Internal Server Error",
    });
  }
}
