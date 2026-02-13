import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../../db/index.js";
import { requireCmsAuth } from "../../middleware/cmsAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";

const router = express.Router();

/* ================= GET USERS ================= */
router.get(
  "/users",
  requireCmsAuth,
  requirePermission("manage_cms_users"),
  async (req, res) => {
    const { rows } = await pool.query(`
      SELECT au.id, au.username, au.is_active, ar.name AS role_name
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role_id = ar.id
      ORDER BY au.created_at DESC
    `);

    res.json({ list: rows });
  },
);

/* ================= GET ROLES ================= */
router.get(
  "/roles",
  requireCmsAuth,
  requirePermission("manage_cms_users"),
  async (req, res) => {
    const { rows } = await pool.query(`
      SELECT id, name FROM admin_roles
      ORDER BY id ASC
    `);

    res.json({ list: rows });
  },
);

/* ================= CREATE USER ================= */
router.post(
  "/users",
  requireCmsAuth,
  requirePermission("manage_cms_users"),
  async (req, res) => {
    const { username, password, role_id } = req.body;

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `
      INSERT INTO admin_users (username, password_hash, role_id)
      VALUES ($1, $2, $3)
      `,
      [username, hash, role_id],
    );

    res.json({ success: true });
  },
);

/* ================= DELETE USER ================= */
router.delete(
  "/users/:id",
  requireCmsAuth,
  requirePermission("manage_cms_users"),
  async (req, res) => {
    const { id } = req.params;

    // กันลบตัวเอง
    if (Number(id) === req.user.id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    await pool.query(
      `
      DELETE FROM admin_users
      WHERE id = $1
      `,
      [id],
    );

    res.json({ success: true });
  },
);

export default router;
