import cron from "node-cron";
import { pool } from "../db/index.js";
import { fetchZortOrders } from "../services/zort.orders.service.js";

function formatZortDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

async function runSync() {
  console.log("[CRON orders] start");
  try {
    const { rows } = await pool.query(
      `SELECT last_sync_at FROM sync_logs WHERE source = 'orders' LIMIT 1`,
    );

    const lastSyncAt =
      rows.length && rows[0].last_sync_at
        ? new Date(rows[0].last_sync_at)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const updatedAfter = formatZortDate(lastSyncAt);
    console.log(`[CRON orders] updatedatetimeafter=${updatedAfter}`);

    const orders = await fetchZortOrders({ updatedAfter });
    console.log(`[CRON orders] fetched ${orders.length} updated orders`);

    let updated = 0;
    let skipped = 0;

    for (const order of orders) {
      const zortId = String(order.id);

      const existing = await pool.query(
        `SELECT id FROM orders WHERE zort_order_id = $1`,
        [zortId],
      );

      if (!existing.rows.length) {
        console.log(`CRON SKIP unknown zort_order_id: ${zortId}`);
        skipped++;
        continue;
      }

      await pool.query(
        `
        UPDATE orders SET
          status         = $1,
          payment_status = $2,
          raw_data       = $3,
          updated_at     = now()
        WHERE zort_order_id = $4
        `,
        [
          order.status || null,
          order.paymentstatus || null,
          order,
          zortId,
        ],
      );
      updated++;
    }

    await pool.query(
      `
      INSERT INTO sync_logs (source, last_sync_at)
      VALUES ('orders', now())
      ON CONFLICT (source) DO UPDATE SET last_sync_at = now()
      `,
    );

    console.log(
      `[CRON orders] done. updated=${updated} skipped=${skipped}`,
    );
  } catch (err) {
    console.error("[CRON orders] failed:", err);
  }
}

cron.schedule("*/15 * * * *", runSync);
console.log("[CRON orders] scheduled */15 * * * *");
