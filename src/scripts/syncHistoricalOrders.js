import { pool } from "../db/index.js";
import { fetchAndUpsertOrders } from "../services/zort.orders.service.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { rows: users } = await pool.query(
    `SELECT id, email FROM users ORDER BY created_at`,
  );

  console.log(`Historical sync: ${users.length} users to process`);

  let processed = 0;

  for (const user of users) {
    try {
      const { rows: phoneRows } = await pool.query(
        `
        SELECT DISTINCT phone
        FROM user_addresses
        WHERE user_id = $1 AND phone IS NOT NULL
        `,
        [user.id],
      );
      const phones = phoneRows.map((r) => r.phone);

      console.log(`→ ${user.email} (id=${user.id})`);
      await fetchAndUpsertOrders(user.id, user.email, phones);
      processed++;
    } catch (err) {
      console.error(`✗ ${user.email} failed:`, err.message);
    }
    await sleep(500);
  }

  console.log(`Historical sync done: ${processed} users processed`);
}

main()
  .catch((err) => {
    console.error("Historical sync script failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
