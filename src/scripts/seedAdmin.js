import { pool } from "../db/index.js";
import bcrypt from "bcryptjs"; // แนะนำใช้ bcryptjs จะไม่พังใน docker

async function seed() {
  try {
    console.log("🌱 Seeding admin system...");

    /* ================= ROLES ================= */
    await pool.query(`
      INSERT INTO admin_roles (name, description)
      VALUES ('superadmin', 'Full system access')
      ON CONFLICT (name) DO NOTHING
    `);

    /* ================= PERMISSIONS ================= */
    const permissions = [
      { name: "manage_orders", desc: "Manage orders" },
      { name: "manage_admin_users", desc: "Manage admin users" },
      { name: "edit_products", desc: "Edit website content" },
      { name: "view_products", desc: "view products" },
    ];

    for (const perm of permissions) {
      await pool.query(
        `
        INSERT INTO admin_permissions (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING
        `,
        [perm.name, perm.desc],
      );
    }

    /* ================= GET ROLE ID ================= */
    const { rows: roleRows } = await pool.query(
      `SELECT id FROM admin_roles WHERE name = 'superadmin'`,
    );

    const roleId = roleRows[0]?.id;

    if (!roleId) {
      throw new Error("Role not found");
    }

    /* ================= LINK ROLE → PERMISSIONS ================= */
    const { rows: permRows } = await pool.query(
      `SELECT id FROM admin_permissions`,
    );

    for (const perm of permRows) {
      await pool.query(
        `
        INSERT INTO admin_role_permissions (role_id, permission_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [roleId, perm.id],
      );
    }

    /* ================= CREATE DEFAULT ADMIN ================= */
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "123456";

    const hashed = await bcrypt.hash(defaultPassword, 10);

    await pool.query(
      `
      INSERT INTO admin_users (username, password_hash, role_id)
      VALUES ('admin', $1, $2)
      ON CONFLICT (username) DO NOTHING
      `,
      [hashed, roleId],
    );

    console.log("✅ Admin seed complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
}

seed();
