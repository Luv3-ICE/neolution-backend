// routes/admin/sync.js
import express from "express";

const router = express.Router();

router.post("/sync-zort", (req, res) => {
  runSyncZort().catch(console.error);
  res.json({ ok: true, message: "Sync started" });
});

export default router;