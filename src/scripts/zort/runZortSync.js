// src/scripts/zort/runZortSync.js
import { fetchZortSnapshot } from "./fetchZort.js";
import { saveSnapshotToDB } from "./saveZortToDB.js";

export async function runZortSync() {
  const snapshotPath = await fetchZortSnapshot();
  await saveSnapshotToDB(snapshotPath);
}
