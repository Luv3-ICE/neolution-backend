import express from "express";
import { runZortSync } from "../../scripts/zort/runZortSync.js";

const router = express.Router();

router.post("/sync-zort", async (req, res) => {
  try {
    await runZortSync();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
