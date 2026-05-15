import express from "express";
import { pool } from "../../db/index.js";

const router = express.Router();

/**
 * GET /api/products
 * query:
 *  - search
 *  - category
 *  - page
 *  - limit
 */
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;

    const offset = (page - 1) * limit;

    const category = req.query.category || null;
    const search = req.query.search || null;
    const exclude = req.query.exclude || null; // 👈 เพิ่ม

    const { rows } = await pool.query(
      `
      WITH selected_category AS (
        SELECT id, parent_id
        FROM categories
        WHERE slug = $3
      ),
      target_categories AS (
        -- ถ้าเป็น sub → เอาตัวเอง
        SELECT id FROM selected_category WHERE parent_id IS NOT NULL

        UNION

        -- ถ้าเป็น main → เอาลูกทั้งหมด
        SELECT c.id
        FROM categories c
        JOIN selected_category sc ON c.parent_id = sc.id
      )

      SELECT
        p.id,
        p.name,
        p.slug,
        p.description AS desc,
        p.thumbnail_url AS img,
        p.cover_image_url AS img_cover,

        COALESCE(MIN(v.price),0) AS price,

        -- 🔥 เพิ่ม category info
        json_agg(
          DISTINCT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'slug', c.slug,
            'parent_id', c.parent_id
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS categories

      FROM products p

      LEFT JOIN product_variants v ON v.product_id = p.id
      LEFT JOIN product_categories pc ON pc.product_id = p.id
      LEFT JOIN categories c ON c.id = pc.category_id

      WHERE p.is_active = true

      AND (
        $3::text IS NULL
        OR pc.category_id IN (SELECT id FROM target_categories)
      )

      AND ($4::text IS NULL OR p.name ILIKE '%' || $4 || '%')
      AND ($5::uuid IS NULL OR p.id != $5)

      GROUP BY 
        p.id,
        p.name,
        p.slug,
        p.description,
        p.thumbnail_url,
        p.cover_image_url

      ORDER BY p.created_at DESC

      LIMIT $1 OFFSET $2
      `,
      [limit, offset, category, search, exclude],
    );

    const { rows: countRows } = await pool.query(
      `
      WITH selected_category AS (
        SELECT id, parent_id
        FROM categories
        WHERE slug = $1
      ),
      target_categories AS (
        SELECT id FROM selected_category WHERE parent_id IS NOT NULL
        UNION
        SELECT c.id
        FROM categories c
        JOIN selected_category sc ON c.parent_id = sc.id
      )

      SELECT COUNT(DISTINCT p.id) as total

      FROM products p

      LEFT JOIN product_categories pc ON pc.product_id = p.id

      WHERE p.is_active = true

      AND (
        $1::text IS NULL
        OR pc.category_id IN (SELECT id FROM target_categories)
      )

      AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')
      AND ($3::uuid IS NULL OR p.id != $3)
      `,
      [category, search, exclude],
    );

    const total = parseInt(countRows[0].total);

    res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      list: rows,
    });
  } catch (err) {
    console.error("GET /cards error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// router.get("/", async (req, res) => {
//   try {
//     const {
//       search = "",
//       category = null,
//       page = 1,
//       limit = 12,
//       exclude = null,
//     } = req.query;

//     const offset = (page - 1) * limit;

//     // -----------------------
//     // query สินค้า
//     // -----------------------
//     const { rows } = await pool.query(
//       `
//       SELECT
//         p.id,
//         p.name,
//         p.slug,
//         p.thumbnail_url,
//         p.cover_image_url,

//         MIN(v.price) as price,

//         json_agg(
//           DISTINCT jsonb_build_object(
//             'id', c.id,
//             'name', c.name,
//             'slug', c.slug
//           )
//         ) FILTER (WHERE c.id IS NOT NULL) AS categories

//       FROM products p

//       LEFT JOIN product_variants v
//         ON v.product_id = p.id

//       LEFT JOIN product_categories pc
//         ON pc.product_id = p.id

//       LEFT JOIN categories c
//         ON c.id = pc.category_id

//       WHERE p.is_active = true
//       AND ($1 = '' OR p.name ILIKE '%' || $1 || '%')
//       AND ($2::text IS NULL OR c.slug = $2)
//       AND ($5::uuid IS NULL OR p.id != $5)

//       GROUP BY p.id

//       ORDER BY price ASC

//       LIMIT $3 OFFSET $4
//       `,
//       [search, category, limit, offset, exclude],
//     );

//     // -----------------------
//     // count ทั้งหมด
//     // -----------------------
//     const { rows: countRows } = await pool.query(
//       `
//       SELECT COUNT(DISTINCT p.id) as total
//       FROM products p

//       LEFT JOIN product_categories pc
//         ON pc.product_id = p.id

//       LEFT JOIN categories c
//         ON c.id = pc.category_id

//       WHERE p.is_active = true
//       AND ($1 = '' OR p.name ILIKE '%' || $1 || '%')
//       AND ($2::text IS NULL OR c.slug = $2)
//       AND ($3::uuid IS NULL OR p.id != $3)
//       `,
//       [search, category, exclude],
//     );

//     const total = Number(countRows[0].total);
//     const totalPages = Math.ceil(total / limit);

//     res.json({
//       success: true,
//       list: rows,
//       totalPages,
//     });

//   } catch (err) {
//     console.error("❌ PRODUCT LIST ERROR:", err);
//     res.status(500).json({ success: false });
//   }
// });

export default router;