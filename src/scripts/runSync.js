import runSyncZort from "./syncZort.js";

runSyncZort()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Sync failed:", err);
    process.exit(1);
  });
