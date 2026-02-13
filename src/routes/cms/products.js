import express from "express";
import { pool } from "../../db/index.js";

import { requireCmsAuth } from "../../middleware/cmsAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";

const router = express.Router();

/**
 * GET /cms/products
 * ต้อง login CMS ก่อน
 */
router.get(
  "/",
  requireCmsAuth,
  requirePermission("view_products"), // ถ้ายังไม่มี permission นี้ สร้างเพิ่ม
  async (_, res) => {
    const { rows } = await pool.query(`
      SELECT id, name, thumbnail_url, is_active
      FROM products
      ORDER BY created_at DESC
    `);

    res.json({ success: true, list: rows });
  },
);

/**
 * PATCH /cms/products/:id
 * ต้องมี permission แก้สินค้า
 */
router.patch(
  "/:id",
  requireCmsAuth,
  requirePermission("edit_products"),
  async (req, res) => {
    const { id } = req.params;
    const { name, thumbnail_url, is_active } = req.body;

    await pool.query(
      `
      UPDATE products
      SET
        name = COALESCE($1, name),
        thumbnail_url = COALESCE($2, thumbnail_url),
        is_active = COALESCE($3, is_active),
        updated_at = now()
      WHERE id = $4
      `,
      [name, thumbnail_url, is_active, id],
    );

    res.json({ success: true });
  },
);

export default router;
