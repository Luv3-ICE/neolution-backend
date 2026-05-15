import { verifyToken } from "../utils/jwt.js";
import { pool } from "../db/index.js";

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = auth.split(" ")[1];
    const decoded = verifyToken(token);

    if (decoded.type !== "web") {
      return res.status(403).json({ error: "Invalid token type" });
    }

    // 🔥 ดึง user จาก DB
    const { rows } = await pool.query(
      "SELECT id, user_name, email FROM users WHERE id = $1",
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = {
      id: rows[0].id,
      name: rows[0].user_name, // 👈 map ให้ตรง
      email: rows[0].email,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}
