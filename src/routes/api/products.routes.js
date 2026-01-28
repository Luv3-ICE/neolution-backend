import express from "express";
import { pool } from "../../db/index.js";

const router = express.Router();

/**
 * GET /api/products/:slug
 * Product Detail API
 */
router.get("/:slug", async (req, res) => {
  const { slug } = req.params;

  // -----------------------
  // 1. ดึง product + variants + images
  // -----------------------
  const { rows } = await pool.query(
    `
    SELECT
      p.id AS product_id,
      p.name,
      p.slug,
      p.description,
      p.full_description,
      p.thumbnail_url,
      p.cover_image_url,

      v.id AS variant_id,
      v.name AS variant_name,
      v.price,
      v.stock,
      v.attributes,

      img.id AS image_id,
      img.image_url,
      img.image_type,
      img.variant_id AS image_variant_id

    FROM products p
    LEFT JOIN product_variants v
      ON v.product_id = p.id

    LEFT JOIN product_images img
      ON img.variant_id = v.id
      OR (img.product_id = p.id AND img.variant_id IS NULL)

    WHERE p.slug = $1
      AND p.is_active = true

    ORDER BY
      v.price ASC,
      img.sort_order ASC
    `,
    [slug],
  );

  if (rows.length === 0) {
    return res.status(404).json({ success: false });
  }

  // -----------------------
  // 2. normalize product
  // -----------------------
  const product = {
    id: rows[0].product_id,
    name: rows[0].name,
    slug: rows[0].slug,
    description: rows[0].description,
    full_description: rows[0].full_description,
    thumbnail_url: rows[0].thumbnail_url,
    cover_image_url: rows[0].cover_image_url,
    common_gallery: [],
    variants: [],
    specs: [],
  };

  const variantMap = new Map();
  const commonGallerySet = new Set();

  for (const row of rows) {
    // ---------- variant ----------
    if (row.variant_id) {
      if (!variantMap.has(row.variant_id)) {
        variantMap.set(row.variant_id, {
          id: row.variant_id,
          name: row.variant_name,
          price: row.price,
          stock: row.stock,
          attributes: row.attributes,
          gallery: [],
        });
      }

      // variant gallery
      if (row.image_url && row.image_variant_id === row.variant_id) {
        const v = variantMap.get(row.variant_id);
        if (!v.gallery.includes(row.image_url)) {
          v.gallery.push(row.image_url);
        }
      }
    }

    // ---------- common gallery ----------
    if (row.image_url && row.image_variant_id === null) {
      if (!commonGallerySet.has(row.image_url)) {
        commonGallerySet.add(row.image_url);
        product.common_gallery.push(row.image_url);
      }
    }
  }

  product.variants = Array.from(variantMap.values());

  // -----------------------
  // 3. ดึง product specs (query แยก)
  // -----------------------
  const { rows: specRows } = await pool.query(
    `
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'key', spec_key,
          'label', label,
          'type', content->>'type',
          'content', content
        ) ORDER BY sort_order
      ) AS specs
    FROM product_specs
    WHERE product_id = $1
    `,
    [product.id],
  );

  product.specs = specRows[0]?.specs || [];

  // -----------------------
  // 4. response
  // -----------------------
  res.json({
    success: true,
    product,
  });
});

export default router;
