import express from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { pool } from "../../db/index.js";
import { requireCmsAuth } from "../../middleware/cmsAuth.js";

const router = express.Router();

// S3 Client - ใช้ IAM Role อัตโนมัติ ไม่ต้องใส่ credentials
const s3 = new S3Client({ region: "ap-southeast-1" });

const upload = multer({
  storage: multerS3({
    s3,
    bucket: "neolutionesport.com",
    key: (req, file, cb) => {
      const filename = `downloads/${Date.now()}-${file.originalname}`;
      cb(null, filename);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

// GET /cms/downloads - ดึงรายการทั้งหมด
router.get("/", requireCmsAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, 
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', p.id, 
              'name', p.name,
              'sub_category_id', c.id,
              'sub_category_name', c.name,
              'main_category_id', parent.id,
              'main_category_name', parent.name
            )
          ) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) AS products
      FROM downloads d
      LEFT JOIN download_products dp ON dp.download_id = d.id
      LEFT JOIN products p ON p.id = dp.product_id
      LEFT JOIN product_categories pc ON pc.product_id = p.id
      LEFT JOIN categories c ON c.id = pc.category_id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `);
    res.json({ success: true, downloads: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

router.get("/public", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, 
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', p.id, 
              'name', p.name,
              'sub_category_name', c.name,
              'main_category_name', parent.name
            )
          ) FILTER (WHERE p.id IS NOT NULL), '[]'
        ) AS products
      FROM downloads d
      LEFT JOIN download_products dp ON dp.download_id = d.id
      LEFT JOIN products p ON p.id = dp.product_id
      LEFT JOIN product_categories pc ON pc.product_id = p.id
      LEFT JOIN categories c ON c.id = pc.category_id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE d.is_active = true
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `);
    res.json({ success: true, downloads: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// POST /cms/downloads - อัปโหลดไฟล์ใหม่
router.post("/", requireCmsAuth, upload.single("file"), async (req, res) => {
  try {
    const { name, version, product_ids } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ message: "ไม่พบไฟล์" });

    const file_url = file.location; // S3 URL
    const file_size = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

    // บันทึกลง DB
    const { rows } = await pool.query(
      `INSERT INTO downloads (name, version, file_url, file_size)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, version, file_url, file_size]
    );

    const download = rows[0];

    // ผูกกับ products ถ้ามี
    if (product_ids) {
      const ids = JSON.parse(product_ids);
      for (const product_id of ids) {
        await pool.query(
          `INSERT INTO download_products (download_id, product_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [download.id, product_id]
        );
      }
    }

    res.json({ success: true, download });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// PUT /cms/downloads/:id - แก้ไข metadata
router.put("/:id", requireCmsAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, version, is_active, product_ids } = req.body;

    await pool.query(
      `UPDATE downloads SET name=$1, version=$2, is_active=$3, updated_at=NOW()
       WHERE id=$4`,
      [name, version, is_active, id]
    );

    // อัปเดต products ที่ผูกไว้
    if (product_ids) {
      await pool.query(`DELETE FROM download_products WHERE download_id=$1`, [id]);
      for (const product_id of product_ids) {
        await pool.query(
          `INSERT INTO download_products (download_id, product_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, product_id]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// DELETE /cms/downloads/:id - ลบไฟล์
router.delete("/:id", requireCmsAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // ดึง file_url ก่อนลบ
    const { rows } = await pool.query(
      `SELECT file_url FROM downloads WHERE id=$1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "ไม่พบไฟล์" });

    // ลบจาก S3
    const url = new URL(rows[0].file_url);
    const key = url.pathname.slice(1); // ตัด / ออก

    await s3.send(new DeleteObjectCommand({
      Bucket: "neolutionesport.com",
      Key: key,
    }));

    // ลบจาก DB
    await pool.query(`DELETE FROM downloads WHERE id=$1`, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

export default router;