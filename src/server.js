import express from "express";
import cors from "cors";
import cmsProductsRoutes from "./routes/cms/products.routes.js";
import authRouter from "./routes/auth.js";
import userAddressRouter from "./routes/userAddress.js";
import { pool } from "./db/index.js";
import syncRoute from "./routes/admin/sync.js";
import cmsAuthRoutes from "./routes/cmsAuth.js";
import cmsAdminRoutes from "./routes/cms/admin.routes.js";
import cartRoutes from "./routes/cart.js";
import orderRoutes from "./routes/order.js";
import ordersRouter from "./routes/orders.js";
import { requireAuth } from "./middleware/auth.js";
import productList from "./routes/products/list.js";
import productDetail from "./routes/products/detail.js";
import categoryList from "./routes/categories/list.js";
import cmsDownloadsRoutes from "./routes/cms/downloads.routes.js";
import "./jobs/syncOrderStatus.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.get("/", (_, res) => res.send("API running"));
app.use("/api/products", productList);
app.use("/api/products", productDetail);
app.use("/api/categories", categoryList);
app.use("/cms/products", cmsProductsRoutes);
app.use("/cart", requireAuth, cartRoutes);
app.use("/order", requireAuth, orderRoutes);
app.use("/api/orders", requireAuth, ordersRouter);
app.use("/cms/auth", cmsAuthRoutes);
app.use("/cms/admin", cmsAdminRoutes);
app.use("/cms/downloads", cmsDownloadsRoutes);
app.use("/auth", authRouter);
app.use("/user/addresses", userAddressRouter);
app.use("/admin", syncRoute);
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port : ${PORT}`);
});
