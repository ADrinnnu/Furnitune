// src/web/scripts/fix-storage-urls.mjs
import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";

const serviceJson = process.argv[2];
if (!serviceJson || !fs.existsSync(serviceJson)) {
  console.error("Usage: node fix-storage-urls.mjs <absolute-path-to-serviceAccount.json>");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceJson, "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

/** Replace ALL old bucket occurrences in any string */
function replaceBucket(s) {
  if (typeof s !== "string") return s;

  // 1) googleapis /v0/b/<bucket>/... style
  s = s.replaceAll(
    "/v0/b/furnitune-64458.appspot.com/",
    "/v0/b/furnitune-64458.firebasestorage.app/"
  );

  // 2) Any leftover plain bucket id (rare but safe)
  s = s.replaceAll(
    "furnitune-64458.appspot.com",
    "furnitune-64458.firebasestorage.app"
  );

  // (Optional) storage.googleapis.com direct links
  s = s.replaceAll(
    "storage.googleapis.com/furnitune-64458.appspot.com",
    "storage.googleapis.com/furnitune-64458.firebasestorage.app"
  );

  return s;
}

function deepReplace(value) {
  if (Array.isArray(value)) return value.map(deepReplace);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepReplace(v);
    return out;
  }
  if (typeof value === "string") return replaceBucket(value);
  return value;
}

async function fixCollection(colRef, updated = {count:0}) {
  const snap = await colRef.get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const next = deepReplace(data);
    const changed = JSON.stringify(data) !== JSON.stringify(next);
    if (changed) {
      await doc.ref.update(next);
      updated.count++;
      console.log(`✔ updated ${doc.ref.path}`);
    }

    // Recurse into subcollections
    const subs = await doc.ref.listCollections();
    for (const sub of subs) await fixCollection(sub, updated);
  }
  return updated;
}

(async () => {
  const roots = await db.listCollections();
  const updated = {count:0};
  for (const col of roots) {
    console.log(`Scanning ${col.id} ...`);
    await fixCollection(col, updated);
  }
  console.log(`Done. Updated ${updated.count} document(s).`);
  process.exit(0);
})();
