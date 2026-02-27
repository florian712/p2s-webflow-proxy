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
      return res.status(500).json({
        error: "Missing WEBFLOW_API_TOKEN",
      });
    }

    const headers = {
      Authorization: `Bearer ${WEBFLOW_TOKEN}`,
      "accept-version": "2.0.0",
    };

    // ===== 1️⃣ Fetch schema safely =====
    const schemaRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}`,
      { headers }
    );

    if (!schemaRes.ok) {
      const t = await schemaRes.text();
      return res.status(500).json({ error: "Schema fetch failed", details: t });
    }

    const schemaData = await schemaRes.json();
    const fields = schemaData?.fields || [];

    // Find fields by display name (much safer than slug)
    const formatField = fields.find(f =>
      f.displayName?.toLowerCase().includes("format")
    );

    const categoryField = fields.find(f =>
      f.displayName?.toLowerCase().includes("category")
    );

    const industryField = fields.find(f =>
      f.displayName?.toLowerCase().includes("industry")
    );

    const formatOptions = formatField?.validations?.options || [];
    const categoryOptions = categoryField?.validations?.options || [];
    const industryOptions = industryField?.validations?.options || [];

    // ===== 2️⃣ Fetch items =====
    const itemsRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live`,
      { headers }
    );

    if (!itemsRes.ok) {
      const t = await itemsRes.text();
      return res.status(500).json({ error: "Items fetch failed", details: t });
    }

    const itemsData = await itemsRes.json();
    const items = itemsData?.items || [];

    // ===== 3️⃣ Map items safely =====
    const mapped = items.map(item => {
      const fd = item.fieldData || {};

      const formatId = fd["type-of-resources"];
      const categoryId = fd["field"];
      const industryId = fd["industry"];

      const formatLabel =
        formatOptions.find(o => o.id === formatId)?.name || "Resource";

      const categoryLabel =
        categoryOptions.find(o => o.id === categoryId)?.name || "General";

      const industryLabel =
        industryOptions.find(o => o.id === industryId)?.name || "Cross-Industry";

      return {
        id: item.id,
        slug: fd.slug,
        name: fd.name,
        h1: fd.h1,
        metaDescription: fd["meta-description"],
        content: fd.content,
        thumbnail: fd.thumbnail,
        video: fd.video,
        file: fd.file,
        websiteUrl: fd["website-url"],
        author: fd["author-s"],
        requireFormSubmission: fd["require-form-submission"],
        language: fd.language,
        formatLabel,
        categoryLabel,
        industryLabel
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
