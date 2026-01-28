import express from "express";
import { pool } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /user/addresses
 */
router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM user_addresses
    WHERE user_id = $1
    ORDER BY is_default DESC, created_at DESC
    `,
    [req.user.id],
  );

  res.json({ list: rows });
});

/**
 * POST /user/addresses
 */
router.post("/", requireAuth, async (req, res) => {
  const {
    label,
    name,
    phone,
    address,
    province,
    district,
    subdistrict,
    postcode,
    is_default,
  } = req.body;

  if (is_default) {
    await pool.query(
      `UPDATE user_addresses SET is_default = false WHERE user_id = $1`,
      [req.user.id],
    );
  }

  const { rows } = await pool.query(
    `
    INSERT INTO user_addresses (
      user_id, label, name, phone,
      address, province, district, subdistrict, postcode,
      is_default
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
    `,
    [
      req.user.id,
      label,
      name,
      phone,
      address,
      province,
      district,
      subdistrict,
      postcode,
      is_default || false,
    ],
  );

  res.json({ address: rows[0] });
});

/**
 * PATCH /user/addresses/:id
 */
router.patch("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const fields = [
    "label",
    "name",
    "phone",
    "address",
    "province",
    "district",
    "subdistrict",
    "postcode",
    "is_default",
  ];

  if (req.body.is_default) {
    await pool.query(
      `UPDATE user_addresses SET is_default = false WHERE user_id = $1`,
      [req.user.id],
    );
  }

  const updates = [];
  const values = [];
  let idx = 1;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = $${idx++}`);
      values.push(req.body[f]);
    }
  }

  if (!updates.length) {
    return res.json({ success: true });
  }

  await pool.query(
    `
    UPDATE user_addresses
    SET ${updates.join(", ")}, updated_at = now()
    WHERE id = $${idx} AND user_id = $${idx + 1}
    `,
    [...values, id, req.user.id],
  );

  res.json({ success: true });
});

/**
 * DELETE /user/addresses/:id
 */
router.delete("/:id", requireAuth, async (req, res) => {
  await pool.query(
    `
    DELETE FROM user_addresses
    WHERE id = $1 AND user_id = $2
    `,
    [req.params.id, req.user.id],
  );

  res.json({ success: true });
});

export default router;
