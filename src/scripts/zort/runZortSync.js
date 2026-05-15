import fetchZortProducts from "../../services/zort.service.js";
import saveZortDB from "./saveZortToDB.js";
import { pool } from "../../db/index.js";

async function getLastZortSync() {
  const { rows } = await pool.query(
    `SELECT last_sync_at FROM sync_logs WHERE source = 'zort' LIMIT 1`,
  );
  return rows.length > 0 ? rows[0].last_sync_at : null;
}

async function updateZortSyncTime(client) {
  await client.query(
    `
    INSERT INTO sync_logs (source, last_sync_at)
    VALUES ('zort', now())
    ON CONFLICT (source)
    DO UPDATE SET last_sync_at = now()
    `,
  );
}
function formatZortDateOnly(date) {
  if (!(date instanceof Date)) return null;

  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default async function runZortSync({ force = false } = {}) {
  const client = await pool.connect();

  try {
    console.log("🔄 Start Zort Sync");

    const lastSyncAt = await getLastZortSync();

    // force = true → full sync ไม่สนใจ lastSync
    const syncFrom = force ? null : lastSyncAt;

    if (syncFrom) {
      console.log("⏱ Incremental sync since:", syncFrom.toISOString());
    } else {
      console.log("♻️ Full sync");
    }

    const zortProducts = await fetchZortProducts({
      updatedAfter: syncFrom ? formatZortDateOnly(syncFrom) : null,
    });

    console.log("📦 Zort raw count:", zortProducts.length);

    if (zortProducts.length === 0) {
      console.log("ℹ️ No updated products");
      return;
    }

    await saveZortDB(zortProducts);
    await updateZortSyncTime(client);

    console.log("✅ Zort Sync Finished");
  } catch (error) {
    console.error("❌ Zort Sync Failed:", error);
  } finally {
    client.release();
  }
}
