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
 * Ensure there is a user profile document.
 *
 * - Creates the doc (with role: "user") only if createIfMissing === true.
 * - NEVER overwrites existing role or source fields on later logins.
 */
export async function ensureUserDoc(u, opts = {}) {
  if (!u) return;

  const {
    source,                // "web" | "app" (only used on first create)
    createIfMissing = false, // default: DO NOT create if missing
    touch = false,           // if true, only bump updatedAt
    extra = {},              // extra fields for create
  } = opts;

  const db = getFirestore(auth.app);
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);

  // ---------- CREATE (first time only) ----------
  if (!snap.exists()) {
    if (!createIfMissing) return;

    const provider =
      u.providerData?.[0]?.providerId?.replace(".com", "") || "password";

    await setDoc(ref, {
      uid: u.uid,
      email: u.email ?? "",
      name: u.displayName ?? "",
      photo: u.photoURL ?? "",
      emailVerified: !!u.emailVerified,
      provider,
      source: source || undefined, // "web" or "app"
      role: "user",                // ✅ only set on FIRST create
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...extra,
    });
    return;
  }

  // ---------- UPDATE (later logins) ----------
  if (touch) {
    // only bump timestamp
    await updateDoc(ref, {
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    return;
  }

  // Safe partial update: DO NOT touch role or source here
  const patch = {
    email: u.email ?? null,
    emailVerified: !!u.emailVerified,
    updatedAt: serverTimestamp(),
  };

  // only update name if we actually have one from Firebase
  if (u.displayName && u.displayName.trim()) {
    patch.name = u.displayName.trim();
  }

  // only update photo if present
  if (u.photoURL) {
    patch.photo = u.photoURL;
  }

  await updateDoc(ref, patch).catch(async () => {
    // fallback to merge setDoc if updateDoc fails for some reason
    await setDoc(ref, patch, { merge: true });
  });
}
