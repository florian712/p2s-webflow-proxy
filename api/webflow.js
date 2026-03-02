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
        error: true,
        message: "WEBFLOW_API_TOKEN not found in Vercel environment variables",
      });
    }

    const COLLECTION_ID = "65e1ce3530fd753ef9a25bf8";

    const headers = {
      Authorization: `Bearer ${WEBFLOW_TOKEN}`,
      "accept-version": "2.0.0",
    };

    // 1) Fetch collection schema (needed to translate option IDs -> labels)
    const schemaRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}`,
      { headers }
    );
    const schemaText = await schemaRes.text();
    if (!schemaRes.ok) {
      return res.status(schemaRes.status).json({
        error: true,
        message: "Webflow schema error",
        details: schemaText,
      });
    }
    const schema = JSON.parse(schemaText);
    const fields = Array.isArray(schema.fields) ? schema.fields : [];

    // Build lookup helpers
    const bySlug = new Map(fields.map((f) => [f.slug, f]));
    const findSlugByName = (nameLowerIncludes) => {
      const f = fields.find((x) =>
        String(x.name || "")
          .toLowerCase()
          .includes(nameLowerIncludes.toLowerCase())
      );
      return f?.slug || null;
    };

    // These MUST match what you want on the website:
    const FORMAT_SLUG = "format"; // <-- Format (Option)
    const CATEGORIES_SLUG = "categories"; // <-- Categories (Option)
    const INDUSTRIES_SLUG = "industries"; // <-- Industries (Option)

    // Meta description slug: we find it by field name (because you have "META DESCRIPTION")
    const META_DESC_SLUG =
      findSlugByName("meta description") || "meta-description";

    // Image slugs (you have both)
    const THUMBNAIL_SLUG = "thumbnail";
    const MAIN_IMAGE_SLUG = "main-image";

    // Option lists from schema
    const getOptions = (slug) =>
      bySlug.get(slug)?.validations?.options || [];

    const optionsMap = new Map([
      [FORMAT_SLUG, getOptions(FORMAT_SLUG)],
      [CATEGORIES_SLUG, getOptions(CATEGORIES_SLUG)],
      [INDUSTRIES_SLUG, getOptions(INDUSTRIES_SLUG)],
    ]);

    // Resolve option field value (id -> label). Supports string or array.
    const resolveOption = (slug, value, fallbackLabel) => {
      if (!value) return fallbackLabel;

      const opts = optionsMap.get(slug) || [];

      const resolveOne = (v) => {
        // Sometimes Webflow returns label already (rare but happens).
        // If it matches an option name exactly, keep it.
        if (typeof v === "string") {
          const exactName = opts.find((o) => o.name === v);
          if (exactName) return exactName.name;

          const byId = opts.find((o) => o.id === v);
          if (byId) return byId.name;

          // If it's just a plain string but not in options, keep it (safer than wiping)
          return v;
        }
        return fallbackLabel;
      };

      if (Array.isArray(value)) {
        const labels = value.map(resolveOne).filter(Boolean);
        return labels.length ? labels : fallbackLabel;
      }

      return resolveOne(value);
    };

    // 2) Fetch live items
    const itemsRes = await fetch(
      `https://api.webflow.com/v2/collections/${COLLECTION_ID}/items/live`,
      { headers }
    );
    const itemsText = await itemsRes.text();
    if (!itemsRes.ok) {
      return res.status(itemsRes.status).json({
        error: true,
        message: "Webflow items error",
        details: itemsText,
      });
    }
    const itemsData = JSON.parse(itemsText);
    const items = Array.isArray(itemsData.items) ? itemsData.items : [];

    // 3) Map items into the exact shape Lovable expects
    const mapped = items.map((item) => {
      const fd = item.fieldData || {};

      const formatLabel = resolveOption(
        FORMAT_SLUG,
        fd[FORMAT_SLUG],
        "Resource"
      );

      const categoryLabel = resolveOption(
        CATEGORIES_SLUG,
        fd[CATEGORIES_SLUG],
        "General"
      );

      const industryLabel = resolveOption(
        INDUSTRIES_SLUG,
        fd[INDUSTRIES_SLUG],
        "Cross-industry"
      );

      const metaDescription =
        fd[META_DESC_SLUG] ||
        fd["meta-description"] ||
        fd["meta-description-2"] ||
        "";

      return {
        id: item.id,
        slug: fd.slug,
        name: fd.name || "Untitled",
        h1: fd.h1 || fd.name || "Untitled",
        metaDescription,
        content: fd.content || "",
        thumbnail: fd[THUMBNAIL_SLUG] || null,
        mainImage: fd[MAIN_IMAGE_SLUG] || null,
        video: fd.video || null,
        file: fd.file || null,
        websiteUrl: fd["website-url"] || fd.websiteUrl || null,
        author: fd["author-s"] || [],
        requireFormSubmission: fd["require-form-submission"] || false,
        language: fd.language || null,

        // ✅ THESE are the tags Lovable must use
        formatLabel,
        categoryLabel,
        industryLabel,
      };
    });

    return res.status(200).json({ items: mapped });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message || "Server crashed",
    });
  }
}
