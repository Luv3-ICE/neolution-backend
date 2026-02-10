import fetch from "node-fetch";
const ZORT_BASE = process.env.ZORT_BASE_URL;

/**
 * Fetch products from Zort API
 * Always return ARRAY
 */
export default async function fetchZortProducts() {
  console.log("🔄 Fetching from Zort...");

  const url = `${ZORT_BASE}/Product/GetProducts?limit=3000`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      storename: process.env.ZORT_STORE_NAME,
      apikey: process.env.ZORT_API_KEY,
      apisecret: process.env.ZORT_API_SECRET,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ Zort API raw response:", text);
    throw new Error(`Zort API error: ${res.status}`);
  }

  const json = await res.json();

  // -------- safety guards --------
  if (!json) {
    console.error("❌ Zort response is empty");
    return [];
  }

  if (Array.isArray(json)) {
    return json;
  }

  if (Array.isArray(json.list)) {
    return json.list;
  }

  console.error("❌ Zort response has unexpected shape:", {
    keys: Object.keys(json),
  });

  return [];
}
