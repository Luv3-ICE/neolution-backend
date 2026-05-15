import fetch from "node-fetch";
import { pool } from "../db/index.js";

const ZORT_BASE = "https://open-api.zortout.com/v4";
const LIMIT = 500;
const SALES_CHANNEL = "Neo website";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function zortHeaders() {
  return {
    storename: process.env.ZORT_STORE_NAME_DEV,
    apikey: process.env.ZORT_API_KEY_DEV,
    apisecret: process.env.ZORT_API_SECRET_DEV,
  };
}

export async function fetchZortOrders({
  keyword = null,
  updatedAfter = null,
} = {}) {
  let page = 1;
  const all = [];

  while (true) {
    const params = new URLSearchParams({
      saleschannel: SALES_CHANNEL,
      page: String(page),
      limit: String(LIMIT),
    });
    if (keyword) params.append("keyword", keyword);
    if (updatedAfter) params.append("updatedatetimeafter", updatedAfter);

    const url = `${ZORT_BASE}/Order/GetOrders?${params.toString()}`;
    const res = await fetch(url, { method: "GET", headers: zortHeaders() });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zort GetOrders ${res.status}: ${text}`);
    }

    const json = await res.json();
    const list = Array.isArray(json?.list) ? json.list : [];
    all.push(...list);

    if (list.length < LIMIT) break;
    page++;
    await sleep(300);
  }

  return all;
}

export async function fetchAndUpsertOrders(userId, email, phones = []) {
  const targets = [email, ...phones].filter(Boolean);

  const byId = new Map();
  for (const target of targets) {
    try {
      const orders = await fetchZortOrders({ keyword: target });
      for (const o of orders) {
        if (o?.id != null && !byId.has(o.id)) byId.set(o.id, o);
      }
    } catch (err) {
      console.error(
        `[orders sync] GetOrders failed (keyword=${target}):`,
        err.message,
      );
    }
  }

  for (const order of byId.values()) {
    try {
      const items = Array.isArray(order.list) ? order.list : [];
      const totalAmount =
        order.amount ??
        items.reduce((s, i) => s + (Number(i.totalprice) || 0), 0);

      const { rows } = await pool.query(
        `
        INSERT INTO orders (
          user_id, zort_order_id, order_number, status, payment_status,
          total_amount, shipping_amount, order_date, raw_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (zort_order_id) DO UPDATE SET
          status         = EXCLUDED.status,
          payment_status = EXCLUDED.payment_status,
          raw_data       = EXCLUDED.raw_data,
          updated_at     = now()
        RETURNING id, (xmax = 0) AS inserted
        `,
        [
          userId,
          String(order.id),
          order.number || null,
          order.status || null,
          order.paymentstatus || null,
          totalAmount,
          order.shippingamount ?? 0,
          order.orderdateString || null,
          order,
        ],
      );

      const { id: orderRowId, inserted } = rows[0];

      if (inserted) {
        for (const it of items) {
          await pool.query(
            `
            INSERT INTO order_items
              (order_id, sku, product_name, quantity, price_per_unit, total_price)
            VALUES ($1,$2,$3,$4,$5,$6)
            `,
            [
              orderRowId,
              it.sku || null,
              it.name || null,
              Number(it.number) || 0,
              Number(it.pricepernumber) || 0,
              Number(it.totalprice) || 0,
            ],
          );
        }
      }
    } catch (err) {
      console.error(
        `[orders sync] upsert failed for zort_order_id=${order?.id}:`,
        err.message,
      );
    }
  }

  await pool.query(
    `UPDATE users SET orders_last_synced_at = now() WHERE id = $1`,
    [userId],
  );
}
