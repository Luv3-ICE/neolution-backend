import express from "express";
import { pool } from "../../db/index.js";

const router = express.Router();

router.get("/", async (_, res) => {
  const { rows } = await pool.query(`
    SELECT id, name, thumbnail_url, is_active
    FROM products
    ORDER BY created_at DESC
  `);
  res.json({ success: true, list: rows });
});

router.patch("/:id", async (req, res) => {
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
    [name, thumbnail_url, is_active, id]
  );

  res.json({ success: true });
});

export default router;
