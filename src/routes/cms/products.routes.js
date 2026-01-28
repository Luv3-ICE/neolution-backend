import express from "express";
import { pool } from "../../db/index.js";

const router = express.Router();

/**
 * GET /cms/products/cards
 * สำหรับแสดง Product Card ใน CMS
 */
router.get("/cards", async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.slug,
      p.description AS desc,
      p.thumbnail_url AS img,
      p.cover_image_url AS img_cover,
      MIN(v.price) AS price
    FROM products p
    LEFT JOIN product_variants v ON v.product_id = p.id
    WHERE p.is_active = true
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);

  res.json({ success: true, list: rows });
});

/**
 * PATCH /cms/products/:id
 * Flexible update + Spec replace
 */
router.patch("/:id", async (req, res) => {
  const { id } = req.params;

  const {
    name,
    description,
    full_description,
    thumbnail_url,
    cover_image_url,
    is_active,
    specs,
  } = req.body;

  // -----------------------
  // update products table
  // -----------------------
  await pool.query(
    `
    UPDATE products
    SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      full_description = COALESCE($3, full_description),
      thumbnail_url = COALESCE($4, thumbnail_url),
      cover_image_url = COALESCE($5, cover_image_url),
      is_active = COALESCE($6, is_active),
      updated_at = now()
    WHERE id = $7
    `,
    [
      name,
      description,
      full_description,
      thumbnail_url,
      cover_image_url,
      is_active,
      id,
    ],
  );

  // -----------------------
  // replace specs (CMS-owned)
  // -----------------------
  if (Array.isArray(specs)) {
    await pool.query(
      `
      DELETE FROM product_specs
      WHERE product_id = $1
      `,
      [id],
    );

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];

      await pool.query(
        `
        INSERT INTO product_specs
          (product_id, spec_key, label, content, sort_order)
        VALUES
          ($1, $2, $3, $4, $5)
        `,
        [id, spec.key, spec.label, spec.content, i],
      );
    }
  }

  res.json({ success: true });
});
export default router;
