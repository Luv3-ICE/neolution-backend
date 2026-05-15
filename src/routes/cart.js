import express from "express";
import { pool } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  const { variant_id, quantity } = req.body;

  if (!variant_id || quantity <= 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  try {
    const ENABLE_STOCK_CHECK = false;

    let variantRows;

    if (ENABLE_STOCK_CHECK) {
      const result = await pool.query(
        `SELECT stock FROM product_variants WHERE id = $1`,
        [variant_id],
      );
      variantRows = result.rows;

      if (variantRows.length === 0) {
        return res.status(404).json({ error: "Variant not found" });
      }

      if (variantRows[0].stock < quantity) {
        return res.status(400).json({ error: "Not enough stock" });
      }
    }

    await pool.query(
      `
      INSERT INTO cart_items (user_id, variant_id, quantity)
      VALUES ($1,$2,$3)
      ON CONFLICT (user_id, variant_id)
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity,
      updated_at = now()
      `,
      [req.user.id, variant_id, quantity],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("ADD CART ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT DISTINCT ON (v.id)
        c.variant_id,
        c.quantity,

        v.price,
        v.stock,
        v.zort_sku,
        v.name AS variant_name,

        p.name,

        img.image_url

      FROM cart_items c

      JOIN product_variants v
        ON v.id = c.variant_id

      JOIN products p
        ON p.id = v.product_id

      LEFT JOIN product_images img
        ON img.variant_id = v.id
        OR (img.product_id = p.id AND img.variant_id IS NULL)

      WHERE c.user_id = $1

      ORDER BY v.id, img.sort_order ASC
      `,
      [req.user.id],
    );

    const list = rows.map((item) => ({
      ...item,
      thumbnail_url: item.image_url || item.thumbnail_url,
      total: item.price * item.quantity,
    }));

    const amount = list.reduce((sum, i) => sum + i.total, 0);

    res.json({
      success: true,
      amount,
      list,
    });
  } catch (err) {
    console.error("GET CART ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/bulk", requireAuth, async (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: "Invalid items" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const item of items) {
      if (item.quantity <= 0) continue;

      await client.query(
        `
        UPDATE cart_items
        SET quantity = $1,
            updated_at = now()
        WHERE user_id = $2
        AND variant_id = $3
        `,
        [item.quantity, req.user.id, item.variant_id],
      );
    }

    await client.query("COMMIT");

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to update cart" });
  } finally {
    client.release();
  }
});

router.patch("/:variantId", requireAuth, async (req, res) => {
  const { variantId } = req.params;
  const { quantity } = req.body;

  if (quantity <= 0) {
    return res.status(400).json({ error: "Invalid quantity" });
  }

  await pool.query(
    `
    UPDATE cart_items
    SET quantity = $1,
        updated_at = now()
    WHERE user_id = $2
      AND variant_id = $3
    `,
    [quantity, req.user.id, variantId],
  );

  res.json({ success: true });
});

router.delete("/:variantId", requireAuth, async (req, res) => {
  await pool.query(
    `
    DELETE FROM cart_items
    WHERE user_id = $1
      AND variant_id = $2
    `,
    [req.user.id, req.params.variantId],
  );

  res.json({ success: true });
});

router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        c.quantity,
        v.price,
        v.zort_sku,
        p.name
      FROM cart_items c
      JOIN product_variants v ON v.id = c.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE c.user_id = $1
      `,
      [req.user.id],
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const list = rows.map((item) => ({
      sku: item.zort_sku,
      name: item.name,
      number: item.quantity,
      pricepernumber: item.price,
      discount: "0",
      totalprice: item.price * item.quantity,
    }));

    const amount = list.reduce((sum, i) => sum + i.totalprice, 0);

    const zortPayload = {
      orderdate: new Date().toISOString().split("T")[0],
      amount,
      paymentamount: 0,
      paymentmethod: "Cash",
      list,
    };

    console.log("SEND TO ZORT:", zortPayload);

    // 🔥 ตรงนี้ค่อย fetch ไป Zort API จริง

    // ถ้าสำเร็จ → clear cart
    await pool.query(`DELETE FROM cart_items WHERE user_id = $1`, [
      req.user.id,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
