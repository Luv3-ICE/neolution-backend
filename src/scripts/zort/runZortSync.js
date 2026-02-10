import fetchZortProducts from "../../services/zort.service.js";
import saveZortDB from "./saveZortToDB.js";

export default async function runZortSync() {

  try {
    const zortProducts = await fetchZortProducts();
    // ----------------------------
    // STEP 1: raw summary
    // ----------------------------
    console.log("📦 Zort raw count:", zortProducts?.length ?? 0);

    if (!Array.isArray(zortProducts)) {
      console.error("❌ Zort response is not an array:", typeof zortProducts);
      return;
    }

    // ----------------------------
    // STEP 2: sample (limit 1)
    // ----------------------------
    if (zortProducts.length > 0) {
      console.log("🧩 Zort sample (first 1):");
      zortProducts.slice(0, 1).forEach((item, i) => {
        console.log(`#${i + 1}`, {
          id: item?.id,
          name: item?.name,
          sku: item?.sku,
          category: item?.category,
          subCategory: item?.subCategory,
          variationid: item?.variationid,
          hasVariant: Array.isArray(item?.variant),
        });
      });
    }

    // ----------------------------
    // STEP 3: group by name (top 10)
    // ----------------------------
    const groupedByName = {};
    let invalidItemCount = 0;

    for (const item of zortProducts) {
      if (!item || typeof item !== "object") {
        invalidItemCount++;
        continue;
      }
      if (!item.name) {
        invalidItemCount++;
        continue;
      }
      groupedByName[item.name] = (groupedByName[item.name] || 0) + 1;
    }
    Object.entries(groupedByName)
      .slice(0, 10)
      .forEach(([name, count]) => {
        console.log(`- ${name}: ${count}`);
      });

    if (invalidItemCount > 0) {
      console.warn("⚠️ Invalid items detected:", invalidItemCount);
    }

    // ----------------------------
    // STEP 4: DB sync (เปิด / ปิด ตรงนี้)
    // ----------------------------

    // 🔴 DEBUG MODE: ปิด DB ก่อน
    // console.log("🚫 DB sync skipped (debug mode)");
    // return;

    // 🟢 เปิด DB เมื่อมั่นใจแล้ว
    await saveZortDB(zortProducts);

    console.log("✅ Zort Sync Finished");
  } catch (error) {
    console.error("❌ Zort Sync Failed:", error);
  }
}
