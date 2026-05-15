import express from "express";
import { pool } from "../../db/index.js";

const router = express.Router();

/**
 * GET /api/categories
 */
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        main.id AS main_id,
        main.name AS main_name,
        main.slug AS main_slug,

        sub.id AS sub_id,
        sub.name AS sub_name,
        sub.slug AS sub_slug,

        COUNT(DISTINCT p.id) AS product_count

      FROM categories sub

      JOIN categories main
        ON sub.parent_id = main.id

      LEFT JOIN product_categories pc
        ON pc.category_id = sub.id

      LEFT JOIN products p
        ON p.id = pc.product_id
        AND p.is_active = true

      GROUP BY
        main.id,
        sub.id

      ORDER BY main.name ASC, sub.name ASC
    `);

    const map = new Map();

    for (const row of rows) {
      if (!map.has(row.main_id)) {
        map.set(row.main_id, {
          id: row.main_id,
          name: row.main_name,
          slug: row.main_slug,
          sub_categories: [],
        });
      }

      map.get(row.main_id).sub_categories.push({
        id: row.sub_id,
        name: row.sub_name,
        slug: row.sub_slug,
        product_count: Number(row.product_count),
      });
    }

    res.json({
      success: true,
      categories: Array.from(map.values()),
    });

  } catch (err) {
    console.error("❌ CATEGORY ERROR:", err);
    res.status(500).json({ success: false });
  }
});

export default router;