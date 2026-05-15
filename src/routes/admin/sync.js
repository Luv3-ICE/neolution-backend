import express from "express";
import runZortSync from "../../scripts/zort/runZortSync.js";

const router = express.Router();

router.post("/sync-zort", async (req, res) => {
  try {
    const force = req.query.force === "true";
    runZortSync({ force }).catch(console.error);

    res.json({
      success: true,
      message: `Zort sync started${force ? " (force full sync)" : ""}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
