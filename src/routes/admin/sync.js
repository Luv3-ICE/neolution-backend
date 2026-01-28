// routes/admin/sync.js
import express from "express";
import runSync from "../../scripts/syncZort.js";

const router = express.Router();

router.post("/sync-zort", async (req, res) => {
  await runSync();
  res.json({ ok: true });
});

export default router;
