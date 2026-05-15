import express from "express";
import { pool } from "../../db/index.js";

const router = express.Router();

/**
 * GET /api/products/:slug
 * Product Detail API
 */
router.get("/:slug", async (req, res) => {
  try {
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
      img.variant_id AS image_variant_id,

      c.id AS category_id,
      c.name AS category_name,
      c.slug AS category_slug,
      parent.id AS main_category_id,
      parent.name AS main_category_name,
      parent.slug AS main_category_slug

    FROM products p
    LEFT JOIN product_variants v
      ON v.product_id = p.id

    LEFT JOIN product_images img
      ON img.variant_id = v.id
      OR (img.product_id = p.id AND img.variant_id IS NULL)

    LEFT JOIN product_categories pc
      ON pc.product_id = p.id

    LEFT JOIN categories c
      ON c.id = pc.category_id

    LEFT JOIN categories parent
      ON parent.id = c.parent_id

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
      category: { main: null, sub: null }, // ✅ ใช้ตัวนี้แทน
      variants: [],
      specs: [],
    };

    const variantMap = new Map();
    const commonGallerySet = new Set();

    for (const row of rows) {
      // ---------- categories ----------
      if (row.category_id) {
        // sub category
        if (!product.category.sub) {
          product.category.sub = {
            id: row.category_id,
            name: row.category_name,
            slug: row.category_slug,
          };
        }

        // main category
        if (row.main_category_id && !product.category.main) {
          product.category.main = {
            id: row.main_category_id,
            name: row.main_category_name,
            slug: row.main_category_slug,
          };
        }
      }
      // ---------- variant ----------
      if (row.variant_id) {
        if (!variantMap.has(row.variant_id)) {
          variantMap.set(row.variant_id, {
            id: row.variant_id,
            name: row.variant_name,
            price: row.price,
            stock: row.stock,
            attributes: row.attributes || {},
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
    product.default_variant = product.variants[0] || null;
    // -----------------------
    // 2.5 build options (🔥 สำคัญมาก)
    // -----------------------
    const optionsMap = {};

    for (const variant of product.variants) {
      const attrs = variant.attributes || {};

      for (const key in attrs) {
        if (!optionsMap[key]) {
          optionsMap[key] = new Set();
        }
        optionsMap[key].add(attrs[key]);
      }
    }

    // convert Set -> Array
    const options = {};
    for (const key in optionsMap) {
      options[key] = Array.from(optionsMap[key]).sort();
    }

    product.options = options;
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
    res.json({
      success: true,
      product,
    });
  } catch (err) {
    console.error("❌ PRODUCT DETAIL ERROR:", err);
    res.status(500).json({ success: false });
  }
});

export default router;
