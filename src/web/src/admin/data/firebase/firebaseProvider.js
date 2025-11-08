// src/admin/data/firebaseProvider.js
import app, { db, auth } from "./firebaseCore";
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, where, getDoc // <-- added getDoc
} from "firebase/firestore";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL
} from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";

/* -------------------- helpers -------------------- */

const col = (name) => collection(db, name);

// wait for current user (or null), then read role from Firestore
function currentUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      unsub();
      if (!u) return resolve(null);

      let role = "user";
      try {
        // Aligns with AdminGuard: read users/{uid}.role === "admin"
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          role = snap.data()?.role || "user";
        }
      } catch (e) {
        console.error("Failed to read user role", e);
      }

      resolve({
        uid: u.uid,
        email: u.email ?? undefined,
        emailVerified: !!u.emailVerified,
        role,
      });
    });
  });
}

// Optional guard for admin-only writes
async function requireAdmin() {
  const u = await currentUser();
  if (!u) throw new Error("Sign in required.");
  if (u.role !== "admin") throw new Error("Forbidden.");
}

// ✅ IMPORTANT: explicitly bind Storage to the true bucket id
// We DO NOT touch /src/firebase.js. We only override here for uploads.
const storage = getStorage(app, "gs://furnitune-64458.firebasestorage.app");

// Upload a single file and return both https and gs://
function uploadOne(file, destPath, metadata = {}) {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, destPath);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || undefined,
      customMetadata: {
        uploadedBy: auth.currentUser?.uid || "unknown",
        ...metadata,
      },
    });

    task.on(
      "state_changed",
      null,
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        const gsurl = `gs://${task.snapshot.ref.bucket}/${task.snapshot.ref.fullPath}`;
        resolve({ url, gsurl, fullPath: task.snapshot.ref.fullPath });
      }
    );
  });
}

// Upload an array-like FileList
async function uploadMany(files, slug, sub = "base") {
  if (!files || !files.length) return [];
  const ts = Date.now();
  const arr = Array.from(files);
  return Promise.all(
    arr.map((f, i) =>
      uploadOne(
        f,
        `products/${slug}/${sub}/${ts}-${i}-${(f.name || "image").replace(/\s+/g, "_")}`
      )
    )
  );
}

/* -------------------- provider -------------------- */

export const firebaseProvider = {
  /* Auth-ish */
  async getCurrentUser() { return currentUser(); },
  async requireRole(roles) {
    const u = await currentUser();
    if (!u || !roles.includes(u.role)) throw new Error("Forbidden");
  },

  /* Designs */
  async listDesigns() {
    const snap = await getDocs(query(col("designs"), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async createDesign(d) {
    await requireAdmin();
    const refDoc = await addDoc(col("designs"), {
      name: d.name,
      description: d.description ?? "",
      status: d.status ?? "draft",
      createdAt: serverTimestamp(),
    });
    return {
      id: refDoc.id,
      name: d.name,
      description: d.description ?? "",
      status: d.status ?? "draft",
      createdAt: Date.now(),
    };
  },
  async updateDesign(id, d) {
    await requireAdmin();
    await updateDoc(doc(db, "designs", id), d);
    return { id, ...d };
  },

  /* Products (simple SKU model + your richer schema support) */
  async listProducts() {
    const snap = await getDocs(query(col("products"), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  /**
   * createProduct(p, files?)
   * - p: plain object. If you already have the richer fields (active, basePrice, categorySlug, etc.), pass them.
   * - files: optional FileList or File[]; or put them on p.__files (the function will detect it).
   */
  async createProduct(p, filesArg) {
    await requireAdmin();

    const files = filesArg || p?.__files || [];
    const slug =
      p.slug ||
      (p.name || p.sku || "product")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    // Upload images first (optional). We save gs:// paths in `images` and the first HTTPS URL as `thumbnail`.
    const uploads = await uploadMany(files, slug, "base");
    const images = uploads.map((u) => u.gsurl);
    const firstHttps = uploads[0]?.url || "";

    // Build doc. Supports both your simple dashboard form AND the richer schema.
    const docData = {
      // simple SKU form fields (keep backward-compatible)
      sku: p.sku || undefined,
      name: p.name || "",
      designId: p.designId || undefined,
      priceCents: typeof p.priceCents === "number" ? p.priceCents : undefined,
      currency: p.currency || "USD",
      stock: typeof p.stock === "number" ? p.stock : 0,
      isActive: typeof p.isActive === "boolean" ? p.isActive : (p.active ?? true),

      // richer product schema (all optional)
      active: p.active ?? (typeof p.isActive === "boolean" ? p.isActive : true),
      basePrice: p.basePrice != null ? Number(p.basePrice) : undefined,
      baseType: p.baseType || undefined,
      categorySlug: p.categorySlug || undefined,
      customizable: !!(p.customizable ?? true),
      departmentSlug: p.departmentSlug || undefined,
      dimensionDefaults: p.dimensionDefaults || undefined,
      images: images.length ? images : p.images || [],
      leadTimeDays: p.leadTimeDays != null ? Number(p.leadTimeDays) : undefined,
      madeToOrder: !!(p.madeToOrder ?? true),
      materialOptions: Array.isArray(p.materialOptions) ? p.materialOptions : [],
      priceStrategy: p.priceStrategy || "lookup",
      ratingAvg: p.ratingAvg != null ? Number(p.ratingAvg) : undefined,
      reviewsCount: p.reviewsCount != null ? Number(p.reviewsCount) : undefined,
      slug,
      style: p.style || undefined,
      tags: Array.isArray(p.tags) ? p.tags : (typeof p.tags === "string" && p.tags ? p.tags.split(",").map(s => s.trim()) : []),
      thumbnail: p.thumbnail || firstHttps || "",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const refDoc = await addDoc(col("products"), docData);
    return { id: refDoc.id, ...docData, createdAt: Date.now(), updatedAt: Date.now() };
  },

  async updateProduct(id, p) {
    await requireAdmin();
    await updateDoc(doc(db, "products", id), { ...p, updatedAt: serverTimestamp() });
    return { id, ...p };
  },

  async deleteProduct(id) {
    await requireAdmin();
    await deleteDoc(doc(db, "products", id));
  },

  /* Orders (read-only list for the dashboard) */
  async listOrders() {
    const snap = await getDocs(query(col("orders"), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  /* Shipments + Events */
  async listShipments() {
    const snap = await getDocs(col("shipments"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async listShipmentEvents(shipmentId) {
    const snap = await getDocs(
      query(col("shipment_events"), where("shipmentId", "==", shipmentId), orderBy("at", "desc"))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async advanceShipment(id, to, note = "") {
    await requireAdmin();
    await updateDoc(doc(db, "shipments", id), { status: to, updatedAt: serverTimestamp() });
    await addDoc(col("shipment_events"), {
      shipmentId: id,
      to,
      note,
      by: auth.currentUser?.email || auth.currentUser?.uid || "admin",
      at: serverTimestamp(),
    });
  },
};

export async function ensureShipmentForOrder(order) {
  await requireAdmin();

  const qy = query(collection(db, "shipments"), where("orderId", "==", order.id));
  const snap = await getDocs(qy);
  if (!snap.empty) return snap.docs[0].id;

  const ref = await addDoc(collection(db, "shipments"), {
    orderId: order.id,
    userId: order.userId || null,
    status: "processing",
    address: order.shippingAddress || null,
    items: order.items || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // optional first event
  try {
    await addDoc(collection(db, "shipments", ref.id, "events"), {
      at: serverTimestamp(),
      from: "pending",
      to: "processing",
      note: "Created from order (To Ship)",
      by: auth.currentUser?.email || auth.currentUser?.uid || "admin",
    });
  } catch (_) {}

  return ref.id;
}

export async function deleteShipmentsForOrder(orderId) {
  await requireAdmin();

  const qy = query(collection(db, "shipments"), where("orderId", "==", orderId));
  const snap = await getDocs(qy);

  for (const s of snap.docs) {
    // delete  events
    try {
      const evSnap = await getDocs(collection(db, "shipments", s.id, "events"));
      await Promise.all(evSnap.docs.map((ev) => deleteDoc(ev.ref)));
    } catch (_) {}

    // delete legacy flat events if you had them
    try {
      const legacy = await getDocs(
        query(collection(db, "shipment_events"), where("shipmentId", "==", s.id))
      );
      await Promise.all(legacy.docs.map((ev) => deleteDoc(ev.ref)));
    } catch (_) {}

    await deleteDoc(doc(db, "shipments", s.id));
  }
}
