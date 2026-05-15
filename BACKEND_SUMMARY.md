# Neolution Backend — สรุปโปรเจกต์

Backend ของเว็บไซต์ Neolution Esport (ขายสินค้า + CMS จัดการหลังบ้าน)
สร้างด้วย **Node.js + Express** ต่อกับ **PostgreSQL** และ sync ข้อมูลสินค้าจาก **Zort (Zortout)** ระบบ ERP/Inventory ภายนอก

---

## 1. Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Runtime | Node.js 20 (ESM, `"type": "module"`) |
| Framework | Express 4 |
| Database | PostgreSQL (`pg` Pool, SSL `rejectUnauthorized: false`) |
| Auth | JSON Web Token (`jsonwebtoken`) + `bcryptjs` |
| File storage | AWS S3 (`@aws-sdk/client-s3`) + `multer-s3` |
| External API | Zort (Zortout) — Product sync + Order push |
| Dev | `nodemon` |
| Deploy | Docker (`node:20-alpine`) + `docker-compose` |

---

## 2. โครงสร้างไดเรกทอรี

```
src/
├── server.js               # Entry point, mount routes ทั้งหมด
├── db/index.js             # PostgreSQL Pool
├── utils/jwt.js            # signToken / verifyToken
│
├── middleware/
│   ├── auth.js             # requireAuth  → token type "web" (ลูกค้า)
│   ├── cmsAuth.js          # requireCmsAuth → token type "cms" (แอดมิน)
│   └── requirePermission.js# RBAC permission check
│
├── routes/
│   ├── auth.js             # POST /auth/register, /auth/login
│   ├── cmsAuth.js          # POST /cms/auth/login (admin)
│   ├── userAddress.js      # CRUD ที่อยู่ของ user
│   ├── cart.js             # cart + checkout (ฝั่ง user)
│   ├── order.js            # /order/checkout → ส่งออเดอร์ไป Zort
│   ├── admin/sync.js       # POST /admin/sync-zort (trigger sync)
│   ├── products/
│   │   ├── list.js         # GET /api/products (paginate + filter)
│   │   └── detail.js       # GET /api/products/:slug
│   ├── categories/list.js  # GET /api/categories (main + sub)
│   └── cms/
│       ├── admin.routes.js     # จัดการ admin users/roles
│       ├── products.routes.js  # CMS แก้สินค้า + อัปโหลดรูป S3
│       └── downloads.routes.js # ระบบไฟล์ดาวน์โหลด (ไดรเวอร์/firmware)
│
├── services/
│   └── zort.service.js     # Fetch สินค้าจาก Zort (pagination + incremental)
│
└── scripts/
    ├── seedAdmin.js        # สร้าง role/permission/admin เริ่มต้น
    └── zort/
        ├── runZortSync.js  # Orchestrator: incremental vs full sync
        └── saveZortToDB.js # Upsert products/variants/categories/images
```

---

## 3. Mount Points (ดู `src/server.js`)

| Path | Auth | หมายเหตุ |
|---|---|---|
| `GET /` | — | health text |
| `GET /health` | — | check DB ping |
| `/api/products` | public | list + detail (slug) |
| `/api/categories` | public | main + sub categories |
| `/auth/*` | public | register / login (user) |
| `/user/addresses/*` | user JWT | CRUD ที่อยู่ |
| `/cart/*` | user JWT | cart + bulk update + checkout |
| `/order/*` | user JWT | checkout → Zort `AddOrder` |
| `/cms/auth/login` | public | admin login |
| `/cms/admin/*` | cms JWT + permission | จัดการ admin users / roles |
| `/cms/products/*` | mixed (บางอันไม่ได้ใส่ middleware) | CMS product edit / upload รูป |
| `/cms/downloads/*` | cms JWT (มี `/public` ไม่ต้องล็อกอิน) | จัดการไฟล์ดาวน์โหลด |
| `/admin/sync-zort` | **ไม่มี auth** ⚠️ | trigger Zort sync |

---

## 4. ระบบ Auth & Roles

มี JWT 2 ชนิด แยกตาม `type` ใน payload:

- **`type: "web"`** — ลูกค้าทั่วไป (table `users`) — TTL 7 วัน
- **`type: "cms"`** — แอดมิน (table `admin_users`) — TTL 8 ชม. + แนบ `permissions[]` ใน token

**RBAC สำหรับ CMS**
- ตาราง `admin_roles`, `admin_permissions`, `admin_role_permissions`
- ตรวจสิทธิ์ด้วย `requirePermission("manage_admin_users" | "manage_orders" | "edit_products" | "view_products")`
- Seed เริ่มต้นด้วย `npm run seed` → สร้าง role `superadmin` + user `admin` (รหัสจาก `DEFAULT_ADMIN_PASSWORD` หรือ `123456`)

---

## 5. Data Model (อนุมานจาก query)

ตารางหลักที่ใช้:

- `users` (id, email, password_hash, user_name)
- `user_addresses` (user_id, label, name, phone, address, province, district, subdistrict, postcode, is_default)
- `admin_users`, `admin_roles`, `admin_permissions`, `admin_role_permissions`
- `products` (id, name, slug **unique**, description, full_description, thumbnail_url, cover_image_url, is_active)
- `product_variants` (product_id, **zort_product_id unique**, zort_sku, name, attributes JSONB, price, stock, is_active)
- `product_images` (product_id, variant_id nullable, image_url, image_type `gallery`/etc, sort_order)
- `product_specs` (product_id, spec_key, label, content JSONB, sort_order)
- `categories` (id, zort_category_id, name, slug **unique**, parent_id) — 2 ระดับ main → sub
- `product_categories` (product_id, category_id)
- `cart_items` (user_id, variant_id, quantity) — `UNIQUE(user_id, variant_id)`
- `downloads` (id, name, version, file_url, file_size, is_active)
- `download_products` (download_id, product_id)
- `sync_logs` (source `unique`, last_sync_at)

---

## 6. Flow สำคัญ

### 6.1 Zort Product Sync
1. `POST /admin/sync-zort?force=true|false` → เรียก `runZortSync()`
2. อ่าน `sync_logs` หา `last_sync_at` ของ source `zort` (ถ้า `force=true` ข้าม)
3. `fetchZortProducts({ updatedAfter })` วน pagination (limit 500, sleep 300 ms/page)
4. `saveZortDB()` — group สินค้าด้วย slug จาก `extractBaseName()` (ตัดข้อความในวงเล็บ), upsert categories (main + sub), products, variants (key = `zort_product_id`), images (diff add/remove)
5. update `sync_logs.last_sync_at`

⚠️ พบ bug: ใน `saveZortToDB.js` วงเล็บปิดผิด — log "✅ saveZortDB completed" ถูกขังในลูป `for (const v of product.variants)` ทำให้พิมพ์ซ้ำต่อ variant แทนที่จะพิมพ์ครั้งเดียวตอนจบ

### 6.2 User Checkout → Zort
`POST /order/checkout` (require user JWT):
1. ดึง cart join `product_variants` + `products`
2. ดึงที่อยู่ default ของ user
3. ประกอบ payload (orderdate, amount, list, shipping*) → ยิง `POST https://open-api.zortout.com/v4/Order/AddOrder` ด้วย header `storename / apikey / apisecret`
4. ถ้าสำเร็จ → `DELETE FROM cart_items WHERE user_id = $1`

หมายเหตุ: `/cart/checkout` ก็มีอยู่แต่ยังไม่ยิงออก Zort จริง — เป็น stub

### 6.3 CMS Upload รูป
- ใช้ `multer-s3` ยัดไฟล์เข้า bucket `neolutionesport.com` ตรง ๆ
- Endpoint: `POST /cms/products/:id/thumbnail`, `POST /cms/products/:id/cover`
- เก็บ URL รูปใหม่ลง DB แล้วเรียก `DeleteObjectCommand` ลบรูปเก่าจาก S3
- S3 client ใช้ IAM Role ของ EC2 (ไม่มี access key ในโค้ด)

---

## 7. Environment Variables

```
PORT                    # default 3000
CORS_ORIGIN             # default "*"
DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT
JWT_SECRET              # default "dev-secret" ⚠️
ZORT_BASE_URL
ZORT_STORE_NAME_DEV
ZORT_API_KEY_DEV
ZORT_API_SECRET_DEV
DEFAULT_ADMIN_PASSWORD  # ใช้ใน seed
```

ไฟล์ `.env.production` มีอยู่ใน repo root แต่ไม่ commit เข้า git (อยู่ใน untracked)

---

## 8. Scripts

| คำสั่ง | งาน |
|---|---|
| `npm run dev` | dev server ด้วย nodemon |
| `npm run sync:zort` | (ชี้ไปไฟล์ที่ถูกลบ `src/scripts/runSync.js` — pending fix) |
| `npm run seed` | สร้าง role/permission/admin เริ่มต้น |

---

## 9. ข้อสังเกต / Tech Debt

1. **`/admin/sync-zort` ไม่มี auth** — ใครก็ยิงได้
2. **JWT default secret** เป็น `"dev-secret"` ถ้าลืม set env
3. **`saveZortToDB.js` วงเล็บปิดผิด** — bug ใน log/loop (ดูข้อ 6.1)
4. **`/cms/products/*` ไม่ได้ใส่ `requireCmsAuth`** ใน route `GET /cards` และ `PATCH /:id` (มีแค่ตอน upload รูป)
5. **`package.json` script `sync:zort`** ชี้ไป `src/scripts/runSync.js` ที่ถูกลบใน git status
6. **`stock check` ปิดอยู่** (`ENABLE_STOCK_CHECK = false`) ใน `cart.js`
7. **node_modules ถูก commit** เข้า repo (ใน working tree)
8. มีไฟล์ใน git status ที่ถูกลบ (`src/routes/api/products.*`, `src/scripts/syncZort.js`, ฯลฯ) — โครงสร้าง routing เพิ่งถูก refactor จาก flat → โฟลเดอร์ย่อย แต่ยังไม่ commit
