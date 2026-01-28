// routes/admin/sync.js
import express from "express";
import runSync from "../../scripts/syncZort.js";

const router = express.Router();

router.post("/sync-zort", async (req, res) => {
  try {
    await runSync();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});
export default router;


runSyncZort()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Sync failed:", err);
    process.exit(1);
  });
