import { fetchZortOrders } from "./fetchZort.js";
import saveZortDB from "./saveZortToDB.js";

export async function runZortSync() {
  console.log("🔄 Start Zort Sync");

  const orders = await fetchZortOrders();
  console.log("📦 Orders from Zort:", orders.length);

  await saveZortDB(orders);

  console.log("✅ Zort Sync Finished");
}
