import express from "express";
import cors from "cors";
import apiProducts from "./routes/api/products.js";
import cmsProductsRoutes from "./routes/cms/products.routes.js";
import apiProductsRoutes from "./routes/api/products.routes.js";
import authRouter from "./routes/auth.js";
import userAddressRouter from "./routes/userAddress.js";
import { pool } from "./db/index.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (_, res) => res.send("API running"));
app.use("/api/products", apiProducts);
app.use("/cms/products", cmsProductsRoutes);
app.use("/api/products", apiProductsRoutes);
app.use("/auth", authRouter);
app.use("/user/addresses", userAddressRouter);

app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
