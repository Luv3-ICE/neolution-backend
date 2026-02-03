// routes/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/index.js";
import { signToken } from "../utils/jwt.js";

const router = express.Router();

/**
 * POST /auth/register
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username)
      return res.status(400).json({ message: "Missing fields" });

    const hash = await bcrypt.hash(password, 10);

    try {
      const { rows } = await pool.query(
        `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email
      `,
        [email, hash],
      );

      const user = rows[0];
      const token = signToken({ id: user.id, email: user.email });

      res.json({ user, token });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(400).json({ error: "Email already exists" });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /auth/login
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    email,
  ]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken({ id: user.id, email: user.email });

  res.json({
    user: { id: user.id, email: user.email },
    token,
  });
});

export default router;
