// src/scripts/saveZortDB.js
import { pool } from "../../db/index.js";

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
export default async function saveZortDB(zortProducts = []) {
  console.log("🟢 Saving Zort data to Database");

  const productMap = new Map();

  // --------------------
  // group by base product
  // --------------------
  for (const item of zortProducts) {
    const baseName = extractBaseName(item.name);
    const slug = slugify(baseName);

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
      attributes: { color: variantName },
      images: item.imageList || [],
      thumbnail: item.imagepath || null,
    });
  }

  // --------------------
  // save each product
  // --------------------
  for (const product of productMap.values()) {
    let categoryId = null;

    // -------- category --------
    if (product.category?.zort_category_id) {
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

      if (product.category.zort_subcategory_id) {
        const subSlug = buildCategorySlug({
          name: product.category.sub_name,
          id: product.category.zort_subcategory_id,
        });

        const { rows } = await pool.query(
          `
          INSERT INTO categories (zort_category_id, name, slug, parent_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (slug)
          DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id
          RETURNING id
          `,
          [
            product.category.zort_subcategory_id,
            product.category.sub_name,
            subSlug,
            mainCategoryId,
          ],
        );

        categoryId = rows[0].id;
      } else {
        categoryId = mainCategoryId;
      }
    }

    // -------- product --------
    const { rows } = await pool.query(
      `
      INSERT INTO products (name, slug, description, full_description, thumbnail_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (slug)
      DO UPDATE SET name = EXCLUDED.name, updated_at = now()
      RETURNING id
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

    // -------- link category --------
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

    // -------- variants --------
    for (const v of product.variants) {
      const { rows: vRows } = await pool.query(
        `
        INSERT INTO product_variants
          (product_id, zort_product_id, zort_sku, name, attributes, price, stock)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (zort_product_id)
        DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock
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

      for (let i = 0; i < v.images.length; i++) {
        await pool.query(
          `
          INSERT INTO product_images
            (product_id, variant_id, image_url, image_type, sort_order)
          VALUES ($1, $2, $3, 'gallery', $4)
          ON CONFLICT DO NOTHING
          `,
          [productId, variantId, v.images[i], i],
        );
      }
    }
  }

  console.log("✅ saveZortDB completed");
}
