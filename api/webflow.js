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

    const headers = {
      Authorization: `Bearer ${WEBFLOW_TOKEN}`,
      "accept-version": "2.0.0",
    };

    // 🔹 Fetch schema to resolve Format options
    const schemaRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}`,
      { headers }
    );

    const schemaData = await schemaRes.json();
    const fields = schemaData.fields || [];

    const formatField = fields.find(
      f => f.slug === "type-of-resources"
    );

    const formatOptions = formatField?.validations?.options || [];

    // 🔹 Fetch items
    const itemsRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live`,
      { headers }
    );

    const itemsData = await itemsRes.json();
    const items = itemsData.items || [];

    const mapped = items.map(item => {
      const fd = item.fieldData || {};

      const formatId = fd["type-of-resources"];

      const formatLabel =
        formatOptions.find(o => o.id === formatId)?.name || "Resource";

      return {
        id: item.id,
        slug: fd.slug,
        name: fd.name,
        h1: fd.h1,
        metaDescription: fd["meta-description"],
        content: fd.content,
        thumbnail: fd.thumbnail || null,
        video: fd.video || null,
        author: fd["author-s"] || [],
        requireFormSubmission: fd["require-form-submission"] || false,
        language: fd.language,

        // ✅ Correct logic
        formatLabel,
        categoryLabel: fd["field"] || "General",
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
