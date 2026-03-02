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

    // Fetch schema
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

    // If debugSlug provided, isolate that item
    const debugSlug = req.query?.debugSlug;

    const processed = items.map(item => {
      const fd = item.fieldData || {};

      const rawReading = fd["reading-time"];

      const finalReading =
        rawReading && rawReading.trim()
          ? rawReading
          : "5 min read";

      return {
        slug: fd.slug,
        rawFieldData: fd,                 // 🔎 FULL RAW DATA
        rawReadingTime: rawReading || null,
        mappedReadingTime: finalReading,
        formatLabel: resolveOption(formatOptions, fd.format, "Resource"),
        categoryLabel: resolveOption(categoriesOptions, fd.categories, "General"),
        industryLabel: resolveOption(industriesOptions, fd.industries, "Cross-industry")
      };
    });

    if (debugSlug) {
      const found = processed.find(p => p.slug === debugSlug);
      return res.status(200).json(found || { message: "Slug not found" });
    }

    return res.status(200).json({
      firstItem: processed[0],
      totalItems: processed.length
    });

  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
