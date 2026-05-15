import { pool } from "./src/db/index.js";

const run = async () => {
  console.log("=== CHECK 1: raw_data keys ===");
  const { rows: r1 } = await pool.query(
    `SELECT raw_data FROM orders LIMIT 1`,
  );
  if (!r1.length) {
    console.log("(no orders in DB)");
  } else {
    const raw = r1[0].raw_data;
    console.log("All top-level keys:");
    console.log(Object.keys(raw));
    console.log("\nShipping/tracking-related keys & sample values:");
    for (const k of Object.keys(raw)) {
      if (/ship|track/i.test(k)) {
        const v = raw[k];
        console.log(
          `  ${k} = ${typeof v === "object" ? JSON.stringify(v) : v}`,
        );
      }
    }
  }

  console.log("\n=== CHECK 2: image JOIN ===");
  const { rows: r2 } = await pool.query(
    `
    SELECT oi.sku, pv.zort_sku, pv.product_id, pi.image_url, pi.image_type
    FROM order_items oi
    LEFT JOIN product_variants pv ON pv.zort_sku = oi.sku
    LEFT JOIN product_images pi ON pi.product_id = pv.product_id
      AND pi.image_type = 'cover'
    LIMIT 5
    `,
  );
  console.table(r2);

  console.log("\n=== CHECK 2b: image_type values present for matched products ===");
  const { rows: r3 } = await pool.query(
    `
    SELECT DISTINCT pi.image_type, COUNT(*) AS n
    FROM order_items oi
    JOIN product_variants pv ON pv.zort_sku = oi.sku
    JOIN product_images pi ON pi.product_id = pv.product_id
    GROUP BY pi.image_type
    `,
  );
  console.table(r3);

  await pool.end();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
