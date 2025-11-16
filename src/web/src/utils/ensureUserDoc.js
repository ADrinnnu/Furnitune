// src/utils/ensureUserDoc.js
import { auth } from "../firebase";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Ensure a user profile document exists.
 *
 * - On first create (if createIfMissing === true), sets role: "user".
 * - On later logins, NEVER changes role or source.
 * - Even if someone passes extra.role = "user", we keep the existing role.
 */
export async function ensureUserDoc(u, opts = {}) {
  if (!u) return;

  const {
    source,                 // "web" | "app" (only used on first create)
    createIfMissing = false,
    touch = false,          // if true, only bump updatedAt
    extra = {},             // extra fields on create (or very careful merges)
  } = opts;

  const db = getFirestore(auth.app);
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() || {}) : null;
  const existingRole = existing?.role;
  const existingSource = existing?.source;

  // ---------- CREATE (first time only) ----------
  if (!snap.exists()) {
    if (!createIfMissing) return; // do nothing if we don't want auto-create

    const provider =
      u.providerData?.[0]?.providerId?.replace(".com", "") || "password";

    await setDoc(ref, {
      uid: u.uid,
      email: u.email ?? "",
      name: u.displayName ?? "",
      photo: u.photoURL ?? "",
      emailVerified: !!u.emailVerified,
      provider,
      source: source || undefined, // only on first create
      role: "user",                // ✅ default role only the first time
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...extra,
    });
    return;
  }

  // ---------- UPDATE (later logins) ----------
  if (touch) {
    // Only bump updatedAt, never touch other fields.
    await updateDoc(ref, { updatedAt: serverTimestamp() }).catch(() => {});
    return;
  }

  // Build a safe patch (DO NOT touch role or source)
  const basePatch = {
    email: u.email ?? null,
    emailVerified: !!u.emailVerified,
    updatedAt: serverTimestamp(),
  };

  if (u.displayName && u.displayName.trim()) {
    basePatch.name = u.displayName.trim();
  }
  if (u.photoURL) {
    basePatch.photo = u.photoURL;
  }

  // Merge in extra, BUT protect role/source from being changed
  const patch = { ...extra, ...basePatch };

  // Hard-freeze role/source if they already exist
  if (existingRole !== undefined) {
    patch.role = existingRole;
  } else {
    delete patch.role;
  }
  if (existingSource !== undefined) {
    patch.source = existingSource;
  } else {
    // if you *really* want source to update, remove this line
    delete patch.source;
  }

  await setDoc(ref, patch, { merge: true });
}
