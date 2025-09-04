// src/lib/notify.js
import { app } from "../firebase";
import {
  getFirestore, collection, addDoc, serverTimestamp
} from "firebase/firestore";

/**
 * Create a notification under /users/{userId}/notifications
 * Run from admin/server code (client has no create permission by rules)
 */
export async function createNotification({
  userId,
  title,
  body,
  image = "",
  link = "",
  type = "system",
}) {
  const db = getFirestore(app);
  return addDoc(collection(db, "users", userId, "notifications"), {
    userId,
    title,
    body,
    image,
    link,
    type,
    read: false,
    createdAt: serverTimestamp(),
  });
}
