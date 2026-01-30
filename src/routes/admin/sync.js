import express from "express";
import { runZortSync } from "../../scripts/zort/runZortSync.js";

const router = express.Router();

router.post("/sync-zort", async (req, res) => {
  try {
    runZortSync().catch(console.error);

    res.json({
      success: true,
      message: "Zort sync started",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
