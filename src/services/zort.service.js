import fetch from "node-fetch";

const ZORT_BASE = process.env.ZORT_BASE_URL;
const LIMIT = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function fetchZortProducts({ updatedAfter = null } = {}) {
  console.log("🔄 Fetching from Zort (pagination + incremental)...");

  let page = 1;
  let allProducts = [];

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
    });

    if (updatedAfter) {
      params.append("updatedafter", updatedAfter);
    }

    const url = `${ZORT_BASE}/Product/GetProducts?${params.toString()}`;

    console.log(
      `➡️ Fetch page ${page}` +
        (updatedAfter ? ` | updatedafter=${updatedAfter}` : ""),
    );

    const res = await fetch(url, {
      method: "GET",
      headers: {
        storename: process.env.ZORT_STORE_NAME_DEV,
        apikey: process.env.ZORT_API_KEY_DEV,
        apisecret: process.env.ZORT_API_SECRET_DEV,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ Zort API raw response:", text);
      throw new Error(`Zort API error: ${res.status}`);
    }

    const json = await res.json();

    let list = [];

    if (Array.isArray(json)) {
      list = json;
    } else if (Array.isArray(json.list)) {
      list = json.list;
    } else {
      console.error("❌ Unexpected Zort response shape:", json);
      break;
    }

    console.log(`📦 page ${page} → ${list.length} items`);

    allProducts.push(...list);

    if (list.length < LIMIT) {
      console.log("🛑 No more pages");
      break;
    }

    page++;
    await sleep(300);
  }

  console.log(`✅ Total fetched from Zort: ${allProducts.length}`);
  return allProducts;
}
