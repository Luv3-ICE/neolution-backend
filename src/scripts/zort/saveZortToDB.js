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

function extractAttributes(item) {
  // กรณี API ส่ง variant มา (ดีที่สุด)
  if (item.variant?.length) {
    return Object.fromEntries(
      item.variant.map(v => [
        v.variantname?.trim(),
        v.name?.trim()
      ])
    );
  }

  // fallback → parse จาก SKU แบบ generic
  if (item.sku) {
    const parts = item.sku.split("-").slice(1); // ตัด prefix SKU

    return parts.reduce((acc, val, index) => {
      acc[`option${index + 1}`] = val;
      return acc;
    }, {});
  }

  return {};
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
 const TARGET_CATEGORY_ID = 282033;

 for (const item of zortProducts) {
   // 🔥 filter category ตรงนี้
  //  if (item.categoryid !== TARGET_CATEGORY_ID) {
  //    skipped++;
  //    continue;
  //  }
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

    const attributes = extractAttributes(item);

    productMap.get(slug).variants.push({
     zort_product_id: item.id,
     sku: item.sku || `SKU-${item.id}`,
     name: Object.values(attributes).join(" / ") || "Default",
     price: Number(item.sellprice) || 0,
     stock: Number(item.stock) || 0,
     is_active: item.active === true,
     attributes,
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
    const productIsActive = product.variants.some((v) => v.is_active === true);

    // -------- product --------
    const { rows } = await pool.query(
      `
      INSERT INTO products
        (name, slug, description, thumbnail_url, is_active)
      VALUES
        ($1, $2, $3, $4, $5)
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING id
      `,
      [
        product.name,
        product.slug,
        product.description,
        product.variants[0]?.thumbnail || null,
        productIsActive,
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
          (
            product_id,
            zort_product_id,
            zort_sku,
            name,
            attributes,
            price,
            stock,
            is_active
          )
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (zort_product_id)
        DO UPDATE SET
          price = EXCLUDED.price,
          stock = EXCLUDED.stock,
          attributes = EXCLUDED.attributes,
          is_active = EXCLUDED.is_active,
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
          v.is_active,
        ],
      );

      const variantId = vRows[0].id;

      // -------- images --------
      // ดึง images ที่มีอยู่แล้วของ variant นี้
      const { rows: existingImages } = await pool.query(
        `SELECT image_url FROM product_images 
        WHERE variant_id = $1 AND image_type = 'gallery'`,
        [variantId]
      );

      const existingUrls = new Set(existingImages.map(r => r.image_url));
      const newUrls = new Set(v.images);

      // เพิ่มรูปใหม่ที่ยังไม่มี
      for (let i = 0; i < v.images.length; i++) {
        if (!existingUrls.has(v.images[i])) {
          await pool.query(
            `INSERT INTO product_images
              (product_id, variant_id, image_url, image_type, sort_order)
            VALUES ($1, $2, $3, 'gallery', $4)`,
            [productId, variantId, v.images[i], i]
          );
        }
      }

      // ลบรูปเก่าที่ไม่มีใน Zort แล้ว
      for (const oldUrl of existingUrls) {
        if (!newUrls.has(oldUrl)) {
          await pool.query(
            `DELETE FROM product_images 
            WHERE variant_id = $1 AND image_url = $2`,
            [variantId, oldUrl]
          );
        }
      }

  console.log(
    `✅ saveZortDB completed | products=${productMap.size} skipped=${skipped}`,
  );
}}}
