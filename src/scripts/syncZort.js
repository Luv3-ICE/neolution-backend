import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchZortProducts } from "../services/zort.service.js";
import { pool } from "../db/index.js";

// --------------------
// utils
// --------------------
function extractBaseName(name) {
  return name.replace(/\s*\(.*?\)\s*/g, "").trim();
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");
}

function buildCategorySlug({ name, id }) {
  const safeName = name && name.trim() !== "" ? slugify(name) : "category";
  return `${safeName}-${id}`;
}

// --------------------
// main
// --------------------
export default async function runSync() {
  console.log("🔄 Syncing from Zort...");
  try {
    const zortProducts = await fetchZortProducts(200);

    // save raw snapshot
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const dataDir = path.join(__dirname, "../../data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

    fs.writeFileSync(
      path.join(dataDir, "zort-snapshot.json"),
      JSON.stringify(zortProducts, null, 2),
    );

    // --------------------
    // group by base product
    // --------------------
    const productMap = new Map();

    for (const item of zortProducts) {
      const baseName = extractBaseName(item.name);
      const slug = slugify(baseName);
      const { categoryid, category, subCategoryId, subCategory } = item;

      const categorySlug = buildCategorySlug({
        name: subCategory || category,
        zortCategoryId: categoryid,
        zortSubCategoryId: subCategoryId,
      });

      if (!productMap.has(slug)) {
        productMap.set(slug, {
          name: baseName,
          slug,
          description: item.description || null,
          full_description: null,
          category: {
            zort_category_id: item.categoryid || null,
            zort_subcategory_id: item.subCategoryId || null,
            name: item.category || null,
            sub_name: item.subCategory || null,
          },
          variants: [],
        });
      }

      const variantName = item.variant?.[0]?.name || null;

      productMap.get(slug).variants.push({
        zort_product_id: item.id,
        sku: item.sku,
        name: variantName,
        price: Number(item.sellprice),
        stock: Number(item.stock),
        attributes: {
          color: variantName,
        },
        images: item.imageList || [],
        thumbnail: item.imagepath || null,
      });
    }

    // --------------------
    // save to database
    // --------------------
    console.log("🟢 Saving to Database");

    for (const product of productMap.values()) {
      // --------------------
      // upsert category (main + sub)
      // --------------------
      let categoryId = null;

      if (product.category?.zort_category_id) {
        // 1. upsert MAIN category
        const mainSlug = buildCategorySlug({
          name: product.category.name,
          id: product.category.zort_category_id,
        });

        const { rows: mainRows } = await pool.query(
          `
        INSERT INTO categories (zort_category_id, name, slug, parent_id)
        VALUES ($1, $2, $3, NULL)
        ON CONFLICT (slug)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        `,
          [product.category.zort_category_id, product.category.name, mainSlug],
        );

        const mainCategoryId = mainRows[0].id;
        // 2. upsert SUB category (ถ้ามี)
        if (product.category.zort_subcategory_id) {
          const subSlug = buildCategorySlug({
            name: product.category.sub_name,
            id: product.category.zort_subcategory_id,
          });

          const { rows: subRows } = await pool.query(
            `
          INSERT INTO categories (zort_category_id, name, slug, parent_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (slug)
          DO UPDATE SET
            name = EXCLUDED.name,
            parent_id = EXCLUDED.parent_id
          RETURNING id
          `,
            [
              product.category.zort_subcategory_id,
              product.category.sub_name,
              subSlug,
              mainCategoryId,
            ],
          );

          categoryId = subRows[0].id;
        } else {
          categoryId = mainCategoryId;
        }
      }

      // upsert product
      const { rows } = await pool.query(
        `
      INSERT INTO products (name, slug, description, full_description, thumbnail_url)
      VALUES ($1, $2, $3, $4, $5)

      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        thumbnail_url = COALESCE(products.thumbnail_url, EXCLUDED.thumbnail_url),
        updated_at = now()
      RETURNING id, description
      `,
        [
          product.name,
          product.slug,
          product.description,
          product.full_description,
          product.variants[0]?.thumbnail || null,
        ],
      );

      const productId = rows[0].id;
      const existing = rows[0];

      // --------------------
      // link product <-> category
      // --------------------
      if (categoryId) {
        await pool.query(
          `
        INSERT INTO product_categories (product_id, category_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
          [productId, categoryId],
        );
      }

      if (!existing.thumbnail_url && product.variants[0]?.thumbnail) {
        await pool.query(
          `
        UPDATE products
        SET thumbnail_url = $1
        WHERE id = $2
        `,
          [product.variants[0].thumbnail, productId],
        );
      }

      // only set description if empty (CMS-safe)
      if (!rows[0].description && product.description) {
        await pool.query(
          `
        UPDATE products
        SET description = $1
        WHERE id = $2
        `,
          [product.description, productId],
        );
      }

      // upsert variants
      for (const v of product.variants) {
        const { rows: vRows } = await pool.query(
          `
        INSERT INTO product_variants
          (product_id, zort_product_id, zort_sku, name, attributes, price, stock)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (zort_product_id)
        DO UPDATE SET
          price = EXCLUDED.price,
          stock = EXCLUDED.stock,
          updated_at = now()
        RETURNING id
        `,
          [
            productId,
            v.zort_product_id,
            v.sku,
            v.name,
            v.attributes,
            v.price,
            v.stock,
          ],
        );

        const variantId = vRows[0].id;
        // insert gallery images (if not exists)
        if (Array.isArray(v.images) && v.images.length > 0) {
          for (let i = 0; i < v.images.length; i++) {
            const imageUrl = v.images[i];

            await pool.query(
              `
            INSERT INTO product_images
              (product_id, variant_id, image_url, image_type, sort_order)
            VALUES
              ($1, $2, $3, 'gallery', $4)
            ON CONFLICT DO NOTHING
            `,
              [productId, variantId, imageUrl, i],
            );
            const { rows: existingImages } = await pool.query(
              `
            SELECT image_url
            FROM product_images
            WHERE variant_id = $1
              AND image_type = 'gallery'
            `,
              [variantId],
            );

            const existingSet = new Set(existingImages.map((i) => i.image_url));
            const incomingSet = new Set(v.images);
            for (const url of existingSet) {
              if (!incomingSet.has(url)) {
                await pool.query(
                  `
                DELETE FROM product_images
                WHERE variant_id = $1 AND image_url = $2
                `,
                  [variantId, url],
                );
              }
            }
            let order = 0;
            for (const url of incomingSet) {
              if (!existingSet.has(url)) {
                await pool.query(
                  `
                INSERT INTO product_images
                  (product_id, variant_id, image_url, image_type, sort_order)
                VALUES
                  ($1, $2, $3, 'gallery', $4)
                `,
                  [productId, variantId, url, order],
                );
              }
              order++;
            }
          }
        }
      } // ลบ variant ที่ไม่มีใน Zort แล้ว
      const zortVariantIds = product.variants.map((v) => v.zort_product_id);

      await pool.query(
        `
      DELETE FROM product_variants
      WHERE product_id = $1
        AND zort_product_id NOT IN (${zortVariantIds
          .map((_, i) => `$${i + 2}`)
          .join(",")})
      `,
        [productId, ...zortVariantIds],
      );
    }

    console.log("✅ Sync completed");
  } catch (err) {
    console.error("❌ Sync failed:", err);
    throw err; // ให้ route จัดการ
  }
}
