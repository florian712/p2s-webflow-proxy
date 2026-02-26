export default async function handler(req, res) {
  export default async function handler(req, res) {
  // ✅ CORS for Lovable preview + published site
  const origin = req.headers.origin;

  // Allow Lovable preview + published domains
  const allowlist = new Set([
    "https://id-preview--8494f224-b792-402d-9771-7c0ea195c0be.lovable.app",
    // Add your published Lovable domain later once you know it:
    // "https://YOUR-PUBLISHED.lovable.app",
  ]);

  if (origin && allowlist.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const slug = req.query.slug || "";
  const token = process.env.WEBFLOW_API_TOKEN;

  if (!token) {
    return res.status(500).json({ error: "Missing Webflow API token" });
  }

  try {
    const response = await fetch(
      "https://api.webflow.com/v2/collections/65e1ce3530fd753ef9a25bf8/items/live",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "accept-version": "2.0.0",
        },
      }
    );

    const data = await response.json();
    let items = data.items || [];

    // Filter by slug if provided
    if (slug) {
      items = items.filter(
        (item) => item.fieldData.slug === slug
      );
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ error: "Webflow fetch failed" });
  }
}
