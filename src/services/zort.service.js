import fetch from "node-fetch";

const ZORT_BASE = "https://open-api.zortout.com/v4";

export async function fetchZortProducts(limit = 50) {
  const url = `${ZORT_BASE}/Product/GetProducts?limit=${limit}`;

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
    console.error("Zort raw response:", text);
    throw new Error(`Zort API error: ${res.status}`);
  }

  const json = await res.json();
  console.log("Zort response:", JSON.stringify(json, null, 2));
  return json.list || [];
}
