import { firebaseProvider } from "./firebase/firebaseProvider";
import { mockProvider } from "./mock/mockProvider";

const USE_FB = import.meta.env.VITE_USE_FIREBASE === "true";
export const provider = USE_FB ? firebaseProvider : mockProvider;
