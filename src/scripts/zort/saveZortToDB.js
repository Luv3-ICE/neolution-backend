import { pool } from "../../db/index.js";

// --------------------
// utils
// --------------------
function extractBaseName(name) {
  if (typeof name !== "string") return null;
  const cleaned = name.replace(/\s*\(.*?\)\s*/g, "").trim();
  return cleaned !== "" ? cleaned : null;
}

function extractVariantFromName(name) {
  if (typeof name !== "string") return null;
  const match = name.match(/\((.*?)\)/);
  return match ? match[1].trim() : null;
}

function slugify(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildCategorySlug({ name, id }) {
  const safeName =
    typeof name === "string" && name.trim() !== "" ? slugify(name) : "category";
  return `${safeName}-${id}`;
}

function getImages(item) {
  if (Array.isArray(item.imageList) && item.imageList.length > 0) {
    return item.imageList;
  }
  if (item.imagepath) return [item.imagepath];
  return [];
}

function getVariantName(item) {
  // premium
  if (item.variant?.length) return item.variant[0].name;

  // legacy (name(variant))
  const fromName = extractVariantFromName(item.name);
  if (fromName) return fromName;

  // fallback
  if (item.sku) return item.sku;
  return "Default";
}

// --------------------
// main
// --------------------
export default async function saveZortDB(zortProducts = []) {
  console.log("🟢 Saving Zort data to Database");

  const productMap = new Map();
  let skipped = 0;

  // --------------------
  // group products
  // --------------------
  for (const item of zortProducts) {
    const rawName = item.name;

    const baseName = extractBaseName(rawName) || `Product-${item.id}`;

    const slug = slugify(baseName) || `product-${item.id}`;

    if (!productMap.has(slug)) {
      productMap.set(slug, {
        name: baseName,
        slug,
        description: item.description || null,
        category: {
          zort_category_id: item.categoryid || null,
          zort_subcategory_id: item.subCategoryId || null,
          name: item.category || "Uncategorized",
          sub_name: item.subCategory || null,
        },
        variants: [],
      });
    }

    productMap.get(slug).variants.push({
      zort_product_id: item.id,
      sku: item.sku || `SKU-${item.id}`,
      name: getVariantName(item),
      price: Number(item.sellprice) || 0,
      stock: Number(item.stock) || 0,
      attributes: {
        variant: getVariantName(item),
      },
      images: getImages(item),
      thumbnail: item.imagepath || null,
    });
  }

  // --------------------
  // save to database
  // --------------------
  for (const product of productMap.values()) {
    let categoryId = null;

    // -------- categories --------
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

    // -------- product --------
    const { rows } = await pool.query(
      `
      INSERT INTO products
        (name, slug, description, thumbnail_url)
      VALUES
        ($1, $2, $3, $4)
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = now()
      RETURNING id
      `,
      [
        product.name,
        product.slug,
        product.description,
        product.variants[0]?.thumbnail || null,
      ],
    );

    const productId = rows[0].id;

    // -------- product <-> category --------
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

      for (let i = 0; i < v.images.length; i++) {
        await pool.query(
          `
          INSERT INTO product_images
            (product_id, variant_id, image_url, image_type, sort_order)
          VALUES
            ($1, $2, $3, 'gallery', $4)
          ON CONFLICT DO NOTHING
          `,
          [productId, variantId, v.images[i], i],
        );
      }
    }
  }

  console.log(
    `✅ saveZortDB completed | products=${productMap.size} skipped=${skipped}`,
  );
}