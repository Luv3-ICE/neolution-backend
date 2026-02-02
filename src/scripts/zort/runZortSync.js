import { fetchZortSnapshot } from "./fetchZort.js";
import saveZortDB from "./saveZortToDB.js";

export async function runZortSync() {
  // console.log("🔄 Start Zort Sync");

  const orders = await fetchZortSnapshot();
  // console.log(`📦 Orders from Zort: ${orders.length}`);

  // await saveZortDB(orders);

  // console.log("✅ Zort Sync Finished");

  console.log("📦 Zort raw count:", orders.length);

  if (orders.length > 0) {
    console.log("🧩 Zort sample (first 5):");
    orders.slice(0, 5).forEach((item, i) => {
      console.log(`#${i + 1}`, {
        id: item?.id,
        name: item?.name,
        sku: item?.sku,
        variationid: item?.variationid,
        hasVariant: Array.isArray(item?.variant),
      });
    });
  }
}
