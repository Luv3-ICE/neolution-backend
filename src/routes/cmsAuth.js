import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/index.js";
import { signToken } from "../utils/jwt.js";

const router = express.Router();

/**
 * POST /cms/login
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const { rows } = await pool.query(
      `
      SELECT au.*, ar.name AS role_name
      FROM admin_users au
      LEFT JOIN admin_roles ar ON au.role_id = ar.id
      WHERE au.username = $1 AND au.is_active = true
      `,
      [username],
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🔥 โหลด permissions
    const { rows: permRows } = await pool.query(
      `
      SELECT ap.name
      FROM admin_role_permissions arp
      JOIN admin_permissions ap ON arp.permission_id = ap.id
      WHERE arp.role_id = $1
      `,
      [user.role_id],
    );

    const permissions = permRows.map((p) => p.name);

    const token = signToken(
      {
        id: user.id,
        username: user.username,
        role: user.role_name,
        permissions,
        type: "cms",
      },
      { expiresIn: "8h" },
    );

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role_name,
        permissions,
      },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
