/**
 * sync-images-by-option.js
 *
 * Builds imagesByOption[colorId][sizeId] arrays for each product by scanning
 * Firebase Storage folders:
 *   products/<slug>/sizes/<Size Label>/colors/<colorId>/*.*
 *
 * Safe: only writes imagesByOption + updatedAt. Does NOT delete anything.
 * Set ONLY_PRODUCT to limit to one product. Use DRY_RUN first.
 */

// ====== CONFIG ======
const BUCKET = 'furnitune-64458.firebasestorage.app'; // your bucket
const DRY_RUN = false;                                // true => no writes
const ONLY_PRODUCT = null;                            // e.g. 'cedar-bed' or null for all
// ====================

const path = require('path');
const { readFileSync } = require('fs');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT = JSON.parse(
  readFileSync(path.resolve(__dirname, '../serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT),
  storageBucket: BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const ROOT_PREFIX = 'products/';

// helpers
const norm = (s) => String(s || '').trim().toLowerCase();
const slug = (s) => norm(s).replace(/\s+/g, '-');

// map a size folder name to the canonical sizeId you use in Firestore
function sizeFolderToId(folderName) {
  const n = norm(folderName);
  if (n === 'single') return 'single';
  if (n === 'double' || n === 'full') return 'double';
  if (n === 'queen') return 'queen';
  if (n === 'king') return 'king';
  if (n === 'california king' || n === 'cal-king') return 'cal-king';

  // Chairs / Sofas / Sectionals / Tables / Benches / Ottomans
  const people = n.match(/^(\d+)\s*people$/);
  if (people) return `${people[1]}p`;
  const seater = n.match(/^(\d+)\s*seater$/);
  if (seater) return `${seater[1]}seater`;

  // fall back to slug form
  return slug(folderName);
}

function assertScoped(p) {
  if (!p.startsWith(ROOT_PREFIX)) {
    throw new Error(`Refusing to touch non-scoped path: ${p}`);
  }
}

async function listPrefixes(prefix) {
  assertScoped(prefix);
  const [, , resp] = await bucket.getFiles({ prefix, delimiter: '/' });
  return resp.prefixes || [];
}

async function listFiles(prefix) {
  assertScoped(prefix);
  const [files] = await bucket.getFiles({ prefix });
  return files;
}

function toGs(fileName) {
  return `gs://${BUCKET}/${fileName}`;
}

(async function run() {
  // pull products (optionally one)
  let q = db.collection('products');
  if (ONLY_PRODUCT) q = q.where('id', '==', ONLY_PRODUCT);
  const snap = await q.get();

  if (snap.empty) {
    console.log(ONLY_PRODUCT ? `No product "${ONLY_PRODUCT}" found.` : 'No products found.');
    return;
  }
  console.log(`Scanning ${snap.size} product(s)…`);

  let writes = 0;
  let touched = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const slugVal =
      data.slug || data.id || (data.name || '').toLowerCase().replace(/\s+/g, '-');

    const productPrefix = `${ROOT_PREFIX}${slugVal}/`;
    const sizesRoot = `${productPrefix}sizes/`;

    // list sizes (e.g. Queen/, King/, 2 people/, 3 seater/, etc.)
    const sizePrefixes = await listPrefixes(sizesRoot);
    if (!sizePrefixes.length) {
      continue; // nothing to sync
    }

    const imagesByOption = data.imagesByOption ? JSON.parse(JSON.stringify(data.imagesByOption)) : {};

    // for each size, list colors
    for (const sizePref of sizePrefixes) {
      // e.g. products/<slug>/sizes/Queen/
      const sizeFolder = sizePref.slice(sizesRoot.length).replace(/\/$/, '');
      const sizeId = sizeFolderToId(sizeFolder);

      const colorsRoot = `${sizePref}colors/`;
      const colorPrefixes = await listPrefixes(colorsRoot);
      if (!colorPrefixes.length) continue;

      for (const colorPref of colorPrefixes) {
        // e.g. products/<slug>/sizes/Queen/colors/white/
        const colorId = colorPref.slice(colorsRoot.length).replace(/\/$/, ''); // expect already 'white' etc.

        // list all files under that color
        const files = await listFiles(colorPref);
        const fileGs = files
          .filter(f => !f.name.endsWith('/')) // ignore folders
          .map(f => toGs(f.name))
          .sort(); // stable order (lexicographic)

        if (!fileGs.length) continue;

        imagesByOption[colorId] = imagesByOption[colorId] || {};
        imagesByOption[colorId][sizeId] = fileGs;
      }
    }

    // If we didn’t find anything new, skip
    if (!Object.keys(imagesByOption).length) continue;

    touched++;

    if (DRY_RUN) {
      console.log(`\n[dry] Would update ${docSnap.id} imagesByOption with combos:`);
      Object.entries(imagesByOption).forEach(([c, sizes]) => {
        Object.entries(sizes).forEach(([s, arr]) => {
          console.log(`  - ${c} × ${s}: ${arr.length} image(s)`);
        });
      });
      continue;
    }

    await docSnap.ref.set(
      {
        imagesByOption,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    writes++;
    console.log(`Updated ${docSnap.id} (imagesByOption).`);
  }

  console.log(`\nDone. ${DRY_RUN ? '(dry run) ' : ''}products touched: ${touched}, writes: ${writes}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
