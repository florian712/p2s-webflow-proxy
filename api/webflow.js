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
        error: "WEBFLOW_API_TOKEN not found",
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

    //  NEW: filter by slug if provided
    if (slug) {
      items = items.filter((item) => item.fieldData?.slug === slug);
    }

    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({
      error: "Server crashed",
      message: error.message,
    });
  }
}
