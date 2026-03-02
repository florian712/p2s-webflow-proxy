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

    // 1️⃣ Fetch collection schema
    const schemaRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}`,
      { headers }
    );
    const schemaData = await schemaRes.json();

    const fields = schemaData.fields || [];

    const formatField = fields.find(f => f.slug === "format");
    const categoriesField = fields.find(f => f.slug === "categories");
    const industriesField = fields.find(f => f.slug === "industries");

    const formatOptions = formatField?.validations?.options || [];
    const categoriesOptions = categoriesField?.validations?.options || [];
    const industriesOptions = industriesField?.validations?.options || [];

    // 2️⃣ Helper to resolve ID → Name
    const resolveOption = (options, value, fallback) => {
      if (!value) return fallback;

      const found = options.find(opt => opt.id === value);
      return found ? found.name : fallback;
    };

    // 3️⃣ Fetch live items
    const itemsRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live`,
      { headers }
    );
    const itemsData = await itemsRes.json();

    const items = itemsData.items || [];

    // 4️⃣ Map items
    const mapped = items.map(item => {
      const fd = item.fieldData || {};

      return {
        id: item.id,
        slug: fd.slug,
        name: fd.name,
        h1: fd.h1 || fd.name,
        metaDescription: fd["meta-description"] || "",
        content: fd.content || "",
        thumbnail: fd.thumbnail || null,
        mainImage: fd["main-image"] || null,
        video: fd.video || null,
        file: fd.file || null,
        websiteUrl: fd["website-url"] || null,
        author: fd["author-s"] || [],
        requireFormSubmission: fd["require-form-submission"] || false,
        language: fd.language || null,

        // 🔥 CORRECT RESOLUTION
        formatLabel: resolveOption(formatOptions, fd.format, "Resource"),
        categoryLabel: resolveOption(categoriesOptions, fd.categories, "General"),
        industryLabel: resolveOption(industriesOptions, fd.industries, "Cross-industry"),
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
