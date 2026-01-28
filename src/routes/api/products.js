import express from "express";
import { pool } from "../../db/index.js";

const router = express.Router();

router.get("/", async (_, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.thumbnail_url,
      json_agg(
        json_build_object(
          'id', v.id,
          'price', v.price,
          'stock', v.stock,
          'attributes', v.attributes
        )
      ) AS variants
    FROM products p
    JOIN product_variants v ON v.product_id = p.id
    WHERE p.is_active = true
    GROUP BY p.id
  `);

  res.json({ success: true, list: rows });
});

export default router;
