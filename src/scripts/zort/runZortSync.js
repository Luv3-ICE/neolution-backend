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

export default async function runZortSync() {
  const client = await pool.connect();

  try {
    console.log("🔄 Start Zort Sync");

    // ----------------------------
    // STEP 1: check last sync
    // ----------------------------
    const lastSyncAt = await getLastZortSync();

    if (lastSyncAt) {
      console.log("⏱ Incremental sync since:", lastSyncAt.toISOString());
    } else {
      console.log("♻️ First time sync → full fetch");
    }

    // ----------------------------
    // STEP 2: fetch
    // ----------------------------
    const zortProducts = await fetchZortProducts({
      updatedAfter: lastSyncAt ? lastSyncAt.toISOString() : null,
    });

    console.log("📦 Zort raw count:", zortProducts.length);

    if (zortProducts.length === 0) {
      console.log("ℹ️ No updated products");
      return;
    }

    // ----------------------------
    // STEP 3: save
    // ----------------------------
    await saveZortDB(zortProducts);

    // ----------------------------
    // STEP 4: commit sync time
    // ----------------------------
    await updateZortSyncTime(client);

    console.log("✅ Zort Sync Finished");
  } catch (error) {
    console.error("❌ Zort Sync Failed:", error);
  } finally {
    client.release();
  }
}
