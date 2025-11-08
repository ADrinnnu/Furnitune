// storage-seed-folders.js
// Usage examples:
//   node storage-seed-folders.js --key "C:\\path\\serviceAccountKey.json" --bucket furnitune-64458.firebasestorage.app
//   node storage-seed-folders.js --key "C:\\path\\serviceAccountKey.json" --bucket gs://furnitune-64458.firebasestorage.app --prefix measurementImage
//   node storage-seed-folders.js --key "C:\\path\\serviceAccountKey.json" --bucket furnitune-64458.firebasestorage.app --clean

const path = require("path");
const admin = require("firebase-admin");

const args = process.argv.slice(2);
const doClean = args.includes("--clean");

function arg(flag, fallback = null) {
  const i = args.indexOf(flag);
  return i > -1 && args[i + 1] ? args[i + 1] : fallback;
}

function normalizeBucket(b) {
  if (!b) return null;
  return b.replace(/^gs:\/\//i, ""); // strip gs:// if present
}

const keyPath =
  arg("--key") ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  (() => { throw new Error("Provide --key or set GOOGLE_APPLICATION_CREDENTIALS"); })();

const rawBucket = arg("--bucket");
const prefix = arg("--prefix", "measurements"); // you can use "measurementImage"
const bucketName = normalizeBucket(
  rawBucket ||
  process.env.FIREBASE_STORAGE_BUCKET ||
  (() => { throw new Error("Provide --bucket or set FIREBASE_STORAGE_BUCKET"); })()
) ;

// Folder scaffold per type
const LAYOUT = {
  beds:       ["single","double","queen","king","california-king","default"],
  sofas:      ["1seater","2seater","3seater","4seater","5-seater","default"],
  chairs:     ["standard","counter","bar","default"],
  tables:     ["2-people","4-people","6-people","8-people","default"],
  benches:    ["2-seater","3-seater","4-seater","default"],
  sectionals: ["3-seater","5-seater","6-seater","7-seater","default"],
  ottomans:   ["standard","cube","footstool","cocktail","default"],
};

(async () => {
  const svc = require(path.resolve(keyPath));

  admin.initializeApp({
    credential: admin.credential.cert(svc),
    storageBucket: bucketName,
  });

  const bucket = admin.storage().bucket(bucketName);
  const contents = Buffer.from("placeholder");
  let count = 0;

  for (const [type, sizes] of Object.entries(LAYOUT)) {
    for (const s of sizes) {
      const filePath = `${prefix}/${type}/${s}/.keep`;
      const file = bucket.file(filePath);
      const gsPath = `gs://${bucketName}/${filePath}`;

      if (doClean) {
        const [exists] = await file.exists();
        if (exists) {
          await file.delete({ ignoreNotFound: true });
          console.log("Deleted ", gsPath);
          count++;
        }
      } else {
        await file.save(contents, {
          contentType: "text/plain",
          resumable: false,
          metadata: { cacheControl: "no-cache" },
        });
        console.log("Created ", gsPath);
        count++;
      }
    }
  }

  console.log(doClean ? `Deleted ${count} placeholder files.` : `Created ${count} placeholder files.`);
  process.exit(0);
})();
