import pg from "pg";

// export const pool = new pg.Pool({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASS,
//   database: process.env.DB_NAME,
// });
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("connect", () => {
  console.log("🟢 PostgreSQL connected");
});
