export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const WEBFLOW_TOKEN = process.env.WEBFLOW_API_TOKEN;

    if (!WEBFLOW_TOKEN) {
      return res.status(500).json({
        error: "WEBFLOW_API_TOKEN not found in Vercel environment variables",
      });
    }

    const COLLECTION_ID = "65e1ce3530fd753ef9a25bf8";
    const slug = req.query.slug;

    const response = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live`,
      {
        headers: {
          Authorization: `Bearer ${WEBFLOW_TOKEN}`,
          "accept-version": "2.0.0",
        },
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Webflow API error",
        details: text,
      });
    }

    const data = JSON.parse(text);
    let items = data.items || [];

    // ===== SLUG FILTERING (already working) =====
    if (slug) {
      items = items.filter(
        (item) => item.fieldData?.slug === slug
      );
    }

    // ===== CLEAN + SAFE TRANSFORMATION =====
    const cleanedItems = items.map((item) => {
      const fd = item.fieldData || {};

      return {
        id: item.id,
        slug: fd.slug || null,
        name: fd.name || null,
        h1: fd.h1 || fd.name || null,
        metaDescription: fd["meta-description"] || null,
        content: fd.content || null,
        thumbnail: fd.thumbnail || null,
        video: fd.video || null,
        author: fd["author-s"] || null,
        requireFormSubmission: fd["require-form-submission"] || false,

        // ===== OPTION FIELDS WITH SAFE FALLBACKS =====
        category: fd.category || "General",
        format: fd.format || "Resource",
        industry: fd.industry || "Cross-Industry",
        language: fd.language || null,
      };
    });

    return res.status(200).json({ items: cleanedItems });

  } catch (error) {
    return res.status(500).json({
      error: "Server crashed",
      message: error.message,
    });
  }
}
