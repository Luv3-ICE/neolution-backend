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
    console.log("========== CHECKOUT START ==========");
    console.log("User:", req.user);

    const userId = req.user?.id;

    if (!userId) {
      console.log("❌ No userId in req.user");
      return res.status(401).json({ error: "Unauthorized" });
    }

    /* ================= CART ================= */
    console.log("Fetching cart...");

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

    console.log("Cart:", cart);

    if (!cart.length) {
      console.log("❌ Cart empty");
      return res.status(400).json({ error: "Cart empty" });
    }

    /* ================= ADDRESS ================= */
    console.log("Fetching default address...");

    const address = await getDefaultAddress(userId);

    console.log("Address:", address);

    if (!address) {
      console.log("❌ No default address");
      return res.status(400).json({ error: "No default address" });
    }

    const fullAddress = `
${address.address}
${address.subdistrict} ${address.district}
${address.province} ${address.postcode}
    `.trim();

    /* ================= BUILD LIST ================= */
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

    console.log("Zort list:", list);
    console.log("Total amount:", amount);

    /* ================= PAYLOAD ================= */
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

    console.log("Sending to ZORT...");
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("ENV CHECK:");
    console.log("ZORT_STORE:", process.env.ZORT_STORE_NAME);
    console.log("ZORT_API_KEY:", process.env.ZORT_API_KEY);
    console.log("ZORT_SECRET:", process.env.ZORT_API_SECRET);

    /* ================= SEND TO ZORT ================= */
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
        body: JSON.stringify(payload),
      },
    );

    console.log("Zort status:", zortRes.status);

    const text = await zortRes.text();
    console.log("Zort raw response:", text);

    let zortData;
    try {
      zortData = JSON.parse(text);
    } catch {
      console.log("❌ Zort response is not JSON");
      zortData = text;
    }

    if (!zortRes.ok) {
      console.log("❌ Zort request failed");
      return res.status(500).json(zortData);
    }

    console.log("✅ Zort success:", zortData);

    /* ================= CLEAR CART ================= */
    console.log("Clearing cart...");
    await pool.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);

    console.log("========== CHECKOUT END ==========");

    res.json({
      success: true,
      zort: zortData,
    });
  } catch (err) {
    console.error("🔥 CHECKOUT ERROR:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

export default router;


