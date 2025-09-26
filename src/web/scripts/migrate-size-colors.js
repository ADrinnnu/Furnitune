/**
 * Scope-safe migration for Firebase Storage (ONLY inside 'products/').
 * What it does:
 *  1) Ensures every size has colors/{red,white,black,brown}/.keep
 *  2) If products/<product>/colors/** exists, moves its files into
 *     products/<product>/sizes/<size>/colors/<color>/**  (copy-if-missing, then delete source)
 *
 * Edit these constants below, then run:  node migrate-size-colors.js
 */

// ====== EDIT ME ======
const BUCKET = 'furnitune-64458.firebasestorage.app';           // your bucket
const ONLY_PRODUCT = null; // e.g. 'aria-bed' to limit to one product, or null for all
const DRY_RUN = false;     // true = print actions, make no changes

// Provide your service account JSON right next to this script:
const SERVICE_ACCOUNT = require('../serviceAccountKey.json'); // rename if needed
// =====================

const ROOT_PREFIX = 'products/'; // hard scope; script refuses to touch anything else
const COLORS = ['red', 'white', 'black', 'brown'];

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT),
  storageBucket: BUCKET,
});
const bucket = admin.storage().bucket();

function assertScoped(path) {
  if (!path.startsWith(ROOT_PREFIX)) {
    throw new Error(`Refusing to touch non-scoped path: ${path}`);
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

async function exists(path) {
  assertScoped(path);
  const [ok] = await bucket.file(path).exists();
  return ok;
}

async function ensurePlaceholder(path) {
  assertScoped(path);
  if (await exists(path)) return false;
  if (DRY_RUN) { console.log('[dry] create', path); return true; }
  await bucket.file(path).save('', {
    resumable: false,
    metadata: { contentType: 'application/octet-stream' },
  });
  return true;
}

async function copyIfMissing(src, dst) {
  assertScoped(src); assertScoped(dst);
  if (await exists(dst)) return 'skip';
  if (DRY_RUN) { console.log('[dry] copy', src, '->', dst); return 'copied'; }
  await bucket.file(src).copy(bucket.file(dst));
  return 'copied';
}

async function deleteMany(paths) {
  for (const p of paths) assertScoped(p);
  if (DRY_RUN) { paths.forEach(p => console.log('[dry] delete', p)); return; }
  await Promise.all(paths.map(p => bucket.file(p).delete().catch(() => null)));
}

(async function run() {
  // list product folders under products/
  let products = await listPrefixes(ROOT_PREFIX);
  if (ONLY_PRODUCT) {
    products = products.filter(p => p === `${ROOT_PREFIX}${ONLY_PRODUCT}/`);
    if (!products.length) {
      console.error(`Product "${ONLY_PRODUCT}" not found under ${ROOT_PREFIX}`);
      process.exit(2);
    }
  }

  let created = 0, copied = 0, skipped = 0, deleted = 0;

  for (const productPrefix of products) {
    const sizesRoot = `${productPrefix}sizes/`;
    const sizePrefixes = await listPrefixes(sizesRoot);

    // 1) Ensure color folders exist in each size
    for (const sizePrefix of sizePrefixes) {
      for (const color of COLORS) {
        const keepPath = `${sizePrefix}colors/${color}/.keep`;
        const made = await ensurePlaceholder(keepPath);
        if (made) { created++; console.log('created', keepPath); }
      }
    }

    // 2) Move top-level colors (if present) into each size
    const productColorsRoot = `${productPrefix}colors/`;
    const topFolders = await listPrefixes(productColorsRoot);
    const topFiles = await listFiles(productColorsRoot);
    const hasTop = topFolders.length || topFiles.length;

    if (hasTop && sizePrefixes.length) {
      console.log(`\nMigrating ${productColorsRoot} -> each size of ${productPrefix}`);
      const allSrcFiles = await listFiles(productColorsRoot);

      for (const src of allSrcFiles) {
        const rel = src.name.substring(productColorsRoot.length); // e.g. "red/foo.png"
        const [color, ...rest] = rel.split('/');
        if (!color || !rest.length) continue; // skip malformed like ".keep"
        for (const sizePrefix of sizePrefixes) {
          const dst = `${sizePrefix}colors/${color}/${rest.join('/')}`;
          const res = await copyIfMissing(src.name, dst);
          if (res === 'copied') copied++; else skipped++;
        }
      }

      await deleteMany(allSrcFiles.map(f => f.name));
      deleted += allSrcFiles.length;
      console.log(`Finished migrating ${productColorsRoot}`);
    }
  }

  console.log(`\nDone (scope=${ROOT_PREFIX}).
  created placeholders: ${created}
  files copied:         ${copied}
  copies skipped:       ${skipped}
  sources deleted:      ${deleted}${DRY_RUN ? ' (dry run)' : ''}`);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
