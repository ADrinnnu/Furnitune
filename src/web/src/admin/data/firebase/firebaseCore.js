// Robust Firebase init that accepts either a single JSON string or per-key vars
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Try to read a single JSON env string (e.g. VITE_FIREBASE_CONFIG='{"apiKey":"..."}')
function readConfigFromJson() {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw);
    // make sure it at least has an apiKey (basic sanity)
    return cfg && cfg.apiKey ? cfg : null;
  } catch {
    console.warn("[firebase] VITE_FIREBASE_CONFIG is not valid JSON. Falling back to per-key env vars.");
    return null;
  }
}

// Or read per-key env vars (no JSON quoting required)
function readConfigFromKeys() {
  const cfg = {
    apiKey: import.meta.env.VITE_FB_API_KEY,
    authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FB_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FB_APP_ID,
  };
  // If none are set, bail out
  return cfg.apiKey ? cfg : null;
}

const firebaseConfig =
  readConfigFromJson() ||
  readConfigFromKeys() ||
  (() => {
    throw new Error(
      "[firebase] No Firebase config found. Provide VITE_FIREBASE_CONFIG (JSON) OR the per-key vars (VITE_FB_API_KEY, VITE_FB_AUTH_DOMAIN, etc.)."
    );
  })();

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
