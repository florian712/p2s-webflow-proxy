export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const WEBFLOW_TOKEN = process.env.WEBFLOW_API_TOKEN;

    if (!WEBFLOW_TOKEN) {
      return res.status(500).json({ error: "WEBFLOW_API_TOKEN not found" });
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

    if (slug) {
      items = items.filter(
        (item) => item.fieldData?.slug === slug
      );
    }

    // ===== OPTION MAPPINGS =====

    const FORMAT_MAP = {
      "11c76a3c3e84919ccca62ed582d230d2": "Web Article",
      "4c261dc592e01a1b4633c849f18d2e37": "File",
      "ee0d076dad6bce3deeed2bfd46f716c6": "Website",
    };

    const cleanedItems = items.map((item) => {
      const fd = item.fieldData || {};

      const formatLabel =
        FORMAT_MAP[fd["type-of-resources"]] || "Resource";

      const categoryLabel =
        fd.category || "General";

      const industryLabel =
        fd.industry || "Cross-Industry";

      return {
        ...item,
        fieldData: {
          ...fd,
          formatLabel,
          categoryLabel,
          industryLabel,
        },
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
