import express from "express";
import { pool } from "../../db/index.js";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { requireCmsAuth } from "../../middleware/cmsAuth.js";

const router = express.Router();

/**
 * GET /cms/products/cards
 * สำหรับแสดง Product Card ใน CMS
 */
router.get("/cards", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;

    const offset = (page - 1) * limit;

    // ดึงสินค้า
    const category = req.query.category || null;
    const search = req.query.search || null;

    const { rows } = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.slug,
        p.description AS desc,
        p.thumbnail_url AS img,
        p.cover_image_url AS img_cover,
        COALESCE(MIN(v.price),0) AS price

      FROM products p

      LEFT JOIN product_variants v ON v.product_id = p.id
      LEFT JOIN product_categories pc ON pc.product_id = p.id
      LEFT JOIN categories c ON c.id = pc.category_id

      WHERE p.is_active = true
      AND ($3::text IS NULL OR c.slug = $3)
      AND ($4::text IS NULL OR p.name ILIKE '%' || $4 || '%')

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
      [limit, offset, category, search],
    );
    const { rows: countRows } = await pool.query(
      `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN product_categories pc ON pc.product_id = p.id
      LEFT JOIN categories c ON c.id = pc.category_id

      WHERE p.is_active = true
      AND ($1::text IS NULL OR c.slug = $1)
      AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')
      `,
      [category, search],
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

// image Section
const s3 = new S3Client({ region: "ap-southeast-1" });

const upload = multer({
  storage: multerS3({
    s3,
    bucket: "neolutionesport.com",
    key: (req, file, cb) => {
      const filename = `products/${Date.now()}-${file.originalname}`;
      cb(null, filename);
    },
  }),

  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB สำหรับรูป

  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true); // ✅ ผ่าน
    } else {
      cb(new Error("Only image files are allowed"), false); // ❌ ไม่ผ่าน
    }
  },
});

function getKeyFromUrl(url) {
  try {
    const u = new URL(url);
    // path จะเป็น /neolutionesport.com/products/xxx.png
    // ต้องตัด /bucketname/ ออก
    const parts = u.pathname.slice(1).split("/");
    parts.shift(); // เอา bucket name ออก
    return parts.join("/");
  } catch {
    return null;
  }
}

async function deleteFromS3(url) {
  try {
    const key = getKeyFromUrl(url);
    if (!key) return;

    await s3.send(
      new DeleteObjectCommand({
        Bucket: "neolutionesport.com",
        Key: key,
      })
    );
  } catch (err) {
    console.error("S3 delete error:", err);
  }
}

function getS3Url(key) {
  return `https://s3.ap-southeast-1.amazonaws.com/neolutionesport.com/${key}`;
}

router.post(
  "/:id/thumbnail",
  requireCmsAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "ไม่พบรูป" });
      }

      // 🔥 ดึงรูปเก่า
      const { rows } = await pool.query(
        `SELECT thumbnail_url FROM products WHERE id = $1`,
        [id]
      );

      const oldUrl = rows[0]?.thumbnail_url;

      // 🔥 update DB
      const key = file.key;
      const url = getS3Url(key);

      // update DB
      await pool.query(
        `UPDATE products
        SET thumbnail_url = $1, updated_at = now()
        WHERE id = $2`,
        [url, id]
      );

      // delete ของเก่า
      if (oldUrl) {
        await deleteFromS3(oldUrl);
      }

      res.json({ success: true, url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false });
    }
  }
);

router.post(
  "/:id/cover",
  requireCmsAuth,
  upload.single("image"),
  async (req, res) => {
    const { id } = req.params;
    const file = req.file;

    const { rows } = await pool.query(
      `SELECT cover_image_url FROM products WHERE id = $1`,
      [id]
    );

    const oldUrl = rows[0]?.cover_image_url;
    const key = file.key;
    const url = getS3Url(key);

    await pool.query(
      `UPDATE products
      SET cover_image_url = $1, updated_at = now()
      WHERE id = $2`,
      [url, id]
    );

    if (oldUrl) {
      await deleteFromS3(oldUrl);
    }

    res.json({ success: true, url });
  }
);
export default router;
