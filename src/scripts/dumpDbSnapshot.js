import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db/index.js";

async function run() {
  console.log("📦 Dumping DB snapshot...");

  const { rows } = await pool.query(`
    SELECT
      p.id AS product_id,
      p.name,
      p.slug,
      p.description,
      p.full_description,
      p.thumbnail_url,
      p.cover_image_url,

      v.id AS variant_id,
      v.name AS variant_name,
      v.zort_sku,
      v.price,
      v.stock,
      v.attributes,

      img.id AS image_id,
      img.image_url,
      img.image_type,
      img.variant_id AS image_variant_id,
      img.sort_order

    FROM products p
    LEFT JOIN product_variants v ON v.product_id = p.id
    LEFT JOIN product_images img ON img.product_id = p.id
    WHERE p.is_active = true
    ORDER BY
      p.created_at DESC,
      v.price ASC,
      img.sort_order ASC
  `);

  const productMap = new Map();

  for (const row of rows) {
    // --------------------
    // init product
    // --------------------
    if (!productMap.has(row.product_id)) {
      productMap.set(row.product_id, {
        id: row.product_id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        full_description: row.full_description,
        thumbnail_url: row.thumbnail_url,
        cover_image_url: row.cover_image_url,
        variants: [],
        common_gallery: [],
      });
    }

    const product = productMap.get(row.product_id);

    // --------------------
    // variants
    // --------------------
    let variant = null;

    if (row.variant_id) {
      variant = product.variants.find((v) => v.id === row.variant_id);

      if (!variant) {
        variant = {
          id: row.variant_id,
          name: row.variant_name,
          sku: row.zort_sku,
          price: row.price,
          stock: row.stock,
          attributes: row.attributes,
          gallery: [],
        };
        product.variants.push(variant);
      }
    }

    // --------------------
    // variant gallery
    // --------------------
    if (
      variant &&
      row.image_type === "gallery" &&
      row.image_variant_id === row.variant_id
    ) {
      if (!variant.gallery.includes(row.image_url)) {
        variant.gallery.push(row.image_url);
      }
    }

    // --------------------
    // common gallery
    // --------------------
    if (row.image_type === "gallery" && row.image_variant_id === null) {
      if (!product.common_gallery.includes(row.image_url)) {
        product.common_gallery.push(row.image_url);
      }
    }
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    product_count: productMap.size,
    products: Array.from(productMap.values()),
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(__dirname, "../../data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  fs.writeFileSync(
    path.join(dataDir, "db-snapshot.json"),
    JSON.stringify(snapshot, null, 2)
  );

  console.log("✅ db-snapshot.json saved");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Dump failed:", err);
  process.exit(1);
});
