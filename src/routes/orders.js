import express from "express";
import { pool } from "../db/index.js";
import { fetchAndUpsertOrders } from "../services/zort.orders.service.js";

const router = express.Router();

const ON_DEMAND_SYNC_INTERVAL_MS = 5 * 60 * 1000;

router.get("/", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { rows: userRows } = await pool.query(
      `SELECT id, email, orders_last_synced_at FROM users WHERE id = $1`,
      [userId],
    );
    if (!userRows.length)
      return res.status(404).json({ error: "User not found" });

    const user = userRows[0];

    const { rows: phoneRows } = await pool.query(
      `
      SELECT DISTINCT phone
      FROM user_addresses
      WHERE user_id = $1 AND phone IS NOT NULL
      `,
      [userId],
    );
    const phones = phoneRows.map((r) => r.phone);

    const lastSyncedAt = user.orders_last_synced_at
      ? new Date(user.orders_last_synced_at).getTime()
      : 0;
    const needSync =
      !lastSyncedAt ||
      Date.now() - lastSyncedAt > ON_DEMAND_SYNC_INTERVAL_MS;

    if (needSync) {
      try {
        await fetchAndUpsertOrders(userId, user.email, phones);
      } catch (err) {
        console.error("[GET /api/orders] on-demand sync failed:", err.message);
      }
    }

    const { rows: orders } = await pool.query(
      `
      SELECT
        o.*,
        o.raw_data->>'trackingno'         AS tracking_no,
        o.raw_data->>'shippingname'       AS shipping_name,
        o.raw_data->>'shippingaddress'    AS shipping_address,
        o.raw_data->>'shippingdateString' AS shipping_date,
        json_agg(
          json_build_object(
            'id', oi.id,
            'sku', oi.sku,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'price_per_unit', oi.price_per_unit,
            'total_price', oi.total_price,
            'image_url', COALESCE(pi_variant.image_url, pi_product.image_url)
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN product_variants pv ON pv.zort_sku = oi.sku
      LEFT JOIN LATERAL (
        SELECT image_url FROM product_images
        WHERE variant_id = pv.id
          AND image_type = 'gallery'
        ORDER BY sort_order ASC
        LIMIT 1
      ) pi_variant ON true
      LEFT JOIN LATERAL (
        SELECT image_url FROM product_images
        WHERE product_id = pv.product_id
          AND variant_id IS NULL
          AND image_type = 'gallery'
        ORDER BY sort_order ASC
        LIMIT 1
      ) pi_product ON true
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.order_date DESC, o.created_at DESC
      `,
      [userId],
    );

    res.json({ orders });
  } catch (err) {
    console.error("[GET /api/orders] error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
