import express from "express";
import { pool } from "../db/index.js";
import fetch from "node-fetch";

const router = express.Router();

async function getDefaultAddress(userId) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM user_addresses
    WHERE user_id = $1
    AND is_default = true
    LIMIT 1
    `,
    [userId],
  );

  return rows[0] || null;
}

/**
 * POST /order/checkout
 */
router.post("/checkout", async (req, res) => {
  try {
    const userId = req.user.id;

    /* ================= CART ================= */
    const { rows: cart } = await pool.query(
      `
      SELECT
        c.quantity,
        v.zort_sku,
        v.price,
        p.name
      FROM cart_items c
      JOIN product_variants v ON v.id = c.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE c.user_id = $1
      `,
      [userId],
    );

    if (!cart.length) {
      return res.status(400).json({ error: "Cart empty" });
    }

    /* ================= ADDRESS ================= */
    const address = await getDefaultAddress(userId);

    if (!address) {
      return res.status(400).json({ error: "No default address" });
    }

    const fullAddress = `
${address.address}
${address.subdistrict} ${address.district}
${address.province} ${address.postcode}
    `.trim();

    /* ================= BUILD ZORT LIST ================= */
    let amount = 0;

    const list = cart.map((item) => {
      const total = item.price * item.quantity;
      amount += total;

      return {
        sku: item.zort_sku,
        name: item.name,
        number: item.quantity,
        pricepernumber: item.price,
        discount: "0",
        totalprice: total,
      };
    });

    /* ================= ZORT PAYLOAD ================= */
    const payload = {
      orderdate: new Date().toISOString().split("T")[0],
      amount,
      paymentamount: 0.0,
      paymentmethod: "Cash",

      saleschannel: "Neo website",

      shippingaddress: fullAddress,
      shippingname: address.name,
      shippingphone: address.phone,

      list,
    };

    /* ================= SEND TO ZORT ================= */
    const zortRes = await fetch(
      "https://open-api.zortout.com/v4/Order/AddOrder",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          storename: process.env.ZORT_STORE,
          apikey: process.env.ZORT_API_KEY,
          apisecret: process.env.ZORT_SECRET,
        },
        body: JSON.stringify(payload),
      },
    );

    const zortData = await zortRes.json();

    if (!zortRes.ok) {
      return res.status(500).json(zortData);
    }

    /* ================= CLEAR CART ================= */
    await pool.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);

    res.json({
      success: true,
      zort: zortData,
    });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});
