export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const WEBFLOW_TOKEN = process.env.WEBFLOW_API_TOKEN;
    const COLLECTION_ID = "65e1ce3530fd753ef9a25bf8";

    if (!WEBFLOW_TOKEN) {
      return res.status(500).json({
        error: true,
        message: "WEBFLOW_API_TOKEN missing"
      });
    }

    const headers = {
      Authorization: `Bearer ${WEBFLOW_TOKEN}`,
      "accept-version": "2.0.0"
    };

    // Fetch collection schema (for option label resolution)
    const schemaRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}`,
      { headers }
    );
    const schema = await schemaRes.json();
    const fields = schema.fields || [];

    const getOptions = (slug) =>
      fields.find(f => f.slug === slug)?.validations?.options || [];

    const formatOptions = getOptions("format");
    const categoriesOptions = getOptions("categories");
    const industriesOptions = getOptions("industries");

    const resolveOption = (options, value, fallback) => {
      if (!value) return fallback;
      const found = options.find(o => o.id === value);
      return found ? found.name : fallback;
    };

    // Fetch LIVE items
    const itemsRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live`,
      { headers }
    );
    const itemsData = await itemsRes.json();
    const items = itemsData.items || [];

    const processed = items.map(item => {
      const fd = item.fieldData || {};

      const readingTime =
        fd["reading-time"] && fd["reading-time"].trim()
          ? fd["reading-time"]
          : "5 min read";

      return {
        id: item.id,
        slug: fd.slug,
        name: fd.name,
        h1: fd.h1 || fd.name,
        metaDescription: fd["meta-description"] || "",
        content: fd.content || "",
        previews: fd.previews || "",   // ✅ ADDED THIS LINE
        thumbnail: fd.thumbnail || null,
        mainImage: fd["main-image"] || null,
        video: fd.video || null,
        file: fd.file || null,
        websiteUrl: fd["website-url"] || null,
        author: fd["author-s"] || [],
        requireFormSubmission: fd["require-form-submission"] || false,
        language: fd.language || null,
        readingTime,
        formatLabel: resolveOption(formatOptions, fd.format, "Resource"),
        categoryLabel: resolveOption(categoriesOptions, fd.categories, "General"),
        industryLabel: resolveOption(industriesOptions, fd.industries, "Cross-industry")
      };
    });

    return res.status(200).json({
      items: processed
    });

  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
