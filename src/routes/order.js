import express from "express";
import pool from "../db.js";
import fetch from "node-fetch";

const router = express.Router();

/**
 * POST /order/checkout
 */
router.post("/checkout", async (req, res) => {
  const userId = req.user.id; // มาจาก auth middleware

  try {
    // ============================
    // 1. ดึง cart + zort_sku
    // ============================
    const { rows: cartItems } = await pool.query(
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
      [userId],
    );

    if (cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // ============================
    // 2. แปลงเป็น format ของ Zort
    // ============================
    const list = cartItems.map((item) => ({
      sku: item.zort_sku,
      name: item.name,
      number: item.quantity,
      pricepernumber: item.price,
      discount: "0",
      totalprice: item.price * item.quantity,
    }));

    const amount = list.reduce((sum, item) => sum + item.totalprice, 0);

    const orderPayload = {
      orderdate: new Date().toISOString().split("T")[0],
      amount,
      paymentamount: 0.0,
      paymentmethod: "Cash",
      list,
    };

    // ============================
    // 3. ยิงไป Zort
    // ============================
    const zortRes = await fetch(
      "https://open-api.zortout.com/v4/Order/AddOrder",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          storename: process.env.ZORT_STORE_NAME,
          apikey: process.env.ZORT_API_KEY,
          apisecret: process.env.ZORT_API_SECRET,
        },
        body: JSON.stringify(orderPayload),
      },
    );

    const zortData = await zortRes.json();

    if (!zortRes.ok) {
      return res.status(400).json({
        error: "Zort error",
        detail: zortData,
      });
    }

    // ============================
    // 4. ล้าง cart
    // ============================
    await pool.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);

    res.json({
      success: true,
      zort: zortData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

export default router;
