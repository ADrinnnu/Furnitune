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
 * Ensure a Firestore user profile exists and is lightly kept in sync.
 *
 * Default behaviour now:
 *  - Creates a doc if missing (with role: "user", source: "web")
 *  - Merges safe fields on every login (email, name, photo, emailVerified, provider)
 *  - Does NOT overwrite role/source so admin changes stay intact.
 */
export async function ensureUserDoc(u, opts = {}) {
  if (!u) return;

  const {
    source = "web",          // "web" | "app" (used on create)
    createIfMissing = true,  // ⬅ changed default: create new docs
    touch = false,           // if true, only bump updatedAt
    extra = {},              // extra fields for create
  } = opts;

  const db = getFirestore(auth.app);
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);

  const providerId = u.providerData?.[0]?.providerId || "password";
  const provider = providerId.replace(".com", "");

  if (!snap.exists()) {
    if (!createIfMissing) return; // optional escape hatch

    const displayName =
      (u.displayName && u.displayName.trim()) ||
      (u.email ? u.email.split("@")[0] : "") ||
      "";

    await setDoc(ref, {
      uid: u.uid,
      email: u.email ?? "",
      name: displayName,
      photo: u.photoURL ?? "",
      emailVerified: !!u.emailVerified,
      provider,
      source,                 // "web" or "app"
      role: "user",           // default role
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...extra,
    });
    return;
  }

  // doc already exists
  if (touch) {
    // just bump updatedAt if you call with { touch: true }
    await updateDoc(ref, { updatedAt: serverTimestamp() }).catch(() => {});
    return;
  }

  const current = snap.data() || {};
  const displayName =
    (u.displayName && u.displayName.trim()) ||
    current.name ||
    (u.email ? u.email.split("@")[0] : "") ||
    "";

  // Merge only safe fields; role/source stay whatever is in Firestore
  const update = {
    email: u.email ?? current.email ?? "",
    name: displayName,
    photo: u.photoURL ?? current.photo ?? "",
    emailVerified: !!u.emailVerified,
    provider: provider || current.provider || "password",
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, update, { merge: true });
}
