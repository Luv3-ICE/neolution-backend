// src/scripts/zort/runZortSync.js
import fetchZortSnapshot from "./fetchZort.js";
import saveZortDB from "./saveZortToDB.js";

export async function runZortSync() {
  const snapshotPath = await fetchZortSnapshot();
  await saveZortDB(snapshotPath);
}
