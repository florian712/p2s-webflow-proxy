export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const WEBFLOW_TOKEN = process.env.WEBFLOW_API_TOKEN;
    const COLLECTION_ID = "65e1ce3530fd753ef9a25bf8";

    if (!WEBFLOW_TOKEN) {
      return res.status(500).json({ error: "Missing WEBFLOW_API_TOKEN" });
    }

    const response = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live`,
      {
        headers: {
          Authorization: `Bearer ${WEBFLOW_TOKEN}`,
          "accept-version": "2.0.0",
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    const items = data.items || [];

    const mapped = items.map(item => {
      const fd = item.fieldData || {};

      return {
        id: item.id,
        slug: fd.slug,
        name: fd.name,
        h1: fd.h1,
        metaDescription: fd["meta-description"],
        content: fd.content,
        thumbnail: fd.thumbnail || null,
        video: fd.video || null,
        file: fd.file || null,
        websiteUrl: fd["website-url"] || null,
        author: fd["author-s"] || [],
        requireFormSubmission: fd["require-form-submission"] || false,
        language: fd.language,

        // ✅ Use value directly
        formatLabel: fd["format"] || "Resource",
        categoryLabel: fd["categories"] || "General",
        industryLabel: fd["industries"] || "Cross-industry",
      };
    });

    return res.status(200).json({ items: mapped });

  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message,
    });
  }
}
