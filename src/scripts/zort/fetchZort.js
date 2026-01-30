// src/scripts/zort/fetchZort.js
import fs from "fs";
import path from "path";
import { fetchZortProducts } from "../../services/zort.service.js";

export async function fetchZortSnapshot(limit = 200) {
  console.log("🔄 Fetching from Zort...");

  const products = await fetchZortProducts(limit);

  const dir = path.resolve("data/zort");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `zort-raw-${Date.now()}.json`;
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, JSON.stringify(products, null, 2));

  console.log(`✅ Zort snapshot saved: ${filename}`);

  return filepath;
}
