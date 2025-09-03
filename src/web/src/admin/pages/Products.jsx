// src/admin/pages/Products.jsx
import React, { useEffect, useState } from "react";
import ConfirmLeave from "../components/ConfirmLeave.jsx";
import app from "../data/firebase/firebaseCore";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { getAuth, onAuthStateChanged } from "firebase/auth";

/* ---------- Helpers ---------- */
const toSlug = (s = "") =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const parseColorText = (t = "") =>
  t
    .split(/;|,|\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((row) => {
      const [name, hex] = row.split(/:\s*/);
      return name && hex ? { name, hex } : null;
    })
    .filter(Boolean);

const parseMaterials = (t = "") =>
  t
    .split(/\n|;/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((row) => {
      const [group, name, up] = row.split("|").map((s) => (s || "").trim());
      const upcharge = Number(up || 0) || 0;
      return group && name ? { group, name, upcharge } : null;
    })
    .filter(Boolean);

const parseTags = (t = "") =>
  t
    .split(/,|\n|;/)
    .map((x) => x.trim())
    .filter(Boolean);

/* ---------- Firestore CRUD ---------- */
const db = getFirestore(app);
const PRODUCTS = collection(db, "products");

async function listProducts() {
  const snap = await getDocs(
    query(PRODUCTS, orderBy("updatedAt", "desc"), limit(200))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function createProduct(data) {
  const refDoc = await addDoc(PRODUCTS, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const fresh = await getDoc(refDoc);
  return { id: fresh.id, ...fresh.data() };
}
async function updateProduct(id, data) {
  const refDoc = doc(db, "products", id);
  await updateDoc(refDoc, { ...data, updatedAt: serverTimestamp() });
  const fresh = await getDoc(refDoc);
  return { id: fresh.id, ...fresh.data() };
}
async function deleteProduct(id) {
  await deleteDoc(doc(db, "products", id));
}

/* ---------- Label wrapper ---------- */
const L = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 4 }}>
      {label}
    </div>
    {children}
  </div>
);

/* ---------- Auth (so uploads include credentials) ---------- */
const auth = getAuth(app);
async function requireAuthUser() {
  if (auth.currentUser) return auth.currentUser;
  const user = await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u || null);
    });
  });
  if (!user) throw new Error("Please sign in to upload images.");
  return user;
}

/* ---------- Page ---------- */
export default function Products() {
  const [items, setItems] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const [colorText, setColorText] = useState("Charcoal:#333333; Sand:#D8C9B3");
  const [materialsText, setMaterialsText] = useState(
    "Upholstery|Linen|0\nFrame|Oak|1500"
  );
  const [tagsText, setTagsText] = useState("chaise");

  const [form, setForm] = useState({
    name: "",
    slug: "",
    sku: "",
    baseType: "Sectionals",
    categorySlug: "sectionals",
    departmentSlug: "living-room",
    style: "Modern",
    priceStrategy: "lookup",
    basePrice: 0,
    active: true,
    customizable: true,
    madeToOrder: true,
    leadTimeDays: 14,
    dimensionDefaults: { width_cm: 0, depth_cm: 0, height_cm: 0 },
    images: [],
    thumbnail: "",
    ratingAvg: 0,
    reviewsCount: 0,
  });

  useEffect(() => {
    listProducts().then((rows) => setItems(rows || []));
  }, []);

  const onEdit = (p) => {
    setDirty(false);
    setFiles([]);
    setColorText((p.colorOptions || []).map((c) => `${c.name}:${c.hex}`).join("; "));
    setMaterialsText(
      (p.materialOptions || [])
        .map((m) => `${m.group}|${m.name}|${m.upcharge || 0}`)
        .join("\n")
    );
    setTagsText((p.tags || []).join(", "));
    setForm((f) => ({ ...f, ...p }));
  };

  // Resumable uploads + tokened https URLs + canonical gs:// (uses your configured bucket as-is)
  async function uploadAllImages(folderKey) {
    if (!files.length) return { gs: [], urls: [] };

    await requireAuthUser(); // ensure Authorization-backed upload (per your rules)

    const storage = getStorage(app);
    const bucket = storage.app.options?.storageBucket || "";

    const gs = [];
    const urls = [];

    const uploadOne = (file, path) =>
      new Promise((resolve, reject) => {
        const r = ref(storage, path);
        const task = uploadBytesResumable(r, file, {
          contentType: file.type || "application/octet-stream",
        });
        task.on(
          "state_changed",
          null,
          reject,
          async () => {
            try {
              const url = await getDownloadURL(task.snapshot.ref); // tokened HTTPS
              const gsUrl = bucket ? `gs://${bucket}/${path}` : `gs:///${path}`;
              resolve({ url, gsUrl });
            } catch (e) {
              reject(e);
            }
          }
        );
      });

    for (const f of files) {
      const safe = (f.name || "image").replace(/\s+/g, "_");
      const path = `products/${folderKey}/${Date.now()}-${safe}`;
      const { url, gsUrl } = await uploadOne(f, path);
      gs.push(gsUrl);
      urls.push(url);
    }
    return { gs, urls };
  }

  async function save() {
    setDirty(false);
    setUploading(true);
    try {
      const payload = {
        ...form,
        slug: form.slug || toSlug(form.name) || form.sku,
        basePrice: Number(form.basePrice) || 0,
        leadTimeDays: Number(form.leadTimeDays) || 0,
        dimensionDefaults: {
          width_cm: Number(form.dimensionDefaults.width_cm) || 0,
          depth_cm: Number(form.dimensionDefaults.depth_cm) || 0,
          height_cm: Number(form.dimensionDefaults.height_cm) || 0,
        },
        colorOptions: parseColorText(colorText),
        materialOptions: parseMaterials(materialsText),
        tags: parseTags(tagsText),
      };

      if (files.length) {
        const { gs, urls } = await uploadAllImages(payload.slug || "no-key");
        payload.images = gs;            // canonical gs:// list
        payload.thumbnail = gs[0];      // canonical gs:// thumb
        payload.imageUrls = urls;       // tokened https list (for <img>)
        payload.thumbnailUrl = urls[0]; // tokened https thumb
      } else {
        // preserve existing on edit
        if (Array.isArray(form.images)) payload.images = form.images;
        if (Array.isArray(form.imageUrls)) payload.imageUrls = form.imageUrls;
        if (form.thumbnail) payload.thumbnail = form.thumbnail;
        if (form.thumbnailUrl) payload.thumbnailUrl = form.thumbnailUrl;
      }

      if (form.id) {
        const updated = await updateProduct(form.id, payload);
        setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      } else {
        const created = await createProduct(payload);
        setItems((prev) => [created, ...prev]);
      }

      setForm((f) => ({
        ...f,
        id: undefined,
        name: "",
        slug: "",
        sku: "",
        basePrice: 0,
        images: [],
        thumbnail: "",
        dimensionDefaults: { width_cm: 0, depth_cm: 0, height_cm: 0 },
      }));
      setFiles([]);
    } catch (e) {
      console.error(e);
      alert(e?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <ConfirmLeave when={dirty} />

      {/* Row 1 */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
          <L label="Product Name">
            <input
              className="admin-input"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Slug (unique)">
            <input
              className="admin-input"
              value={form.slug}
              onChange={(e) => {
                setForm((f) => ({ ...f, slug: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="SKU">
            <input
              className="admin-input"
              value={form.sku}
              onChange={(e) => {
                setForm((f) => ({ ...f, sku: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Base Price">
            <input
              type="number"
              className="admin-input"
              value={form.basePrice}
              onChange={(e) => {
                setForm((f) => ({ ...f, basePrice: +e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Price Strategy">
            <select
              className="admin-select"
              value={form.priceStrategy}
              onChange={(e) => {
                setForm((f) => ({ ...f, priceStrategy: e.target.value }));
                setDirty(true);
              }}
            >
              <option value="lookup">lookup</option>
              <option value="fixed">fixed</option>
            </select>
          </L>
          <L label="Save">
            <button className="admin-btn primary" onClick={save} disabled={uploading}>
              {form.id ? (uploading ? "Saving…" : "Save") : (uploading ? "Creating…" : "Create")}
            </button>
          </L>
        </div>
      </div>

      {/* Row 2 */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
          <L label="Furniture Type">
            <input
              className="admin-input"
              value={form.baseType}
              onChange={(e) => {
                setForm((f) => ({ ...f, baseType: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Category Slug">
            <input
              className="admin-input"
              value={form.categorySlug}
              onChange={(e) => {
                setForm((f) => ({ ...f, categorySlug: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Department Slug">
            <input
              className="admin-input"
              value={form.departmentSlug}
              onChange={(e) => {
                setForm((f) => ({ ...f, departmentSlug: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Style">
            <input
              className="admin-input"
              value={form.style}
              onChange={(e) => {
                setForm((f) => ({ ...f, style: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Active?">
            <select
              className="admin-select"
              value={form.active ? "yes" : "no"}
              onChange={(e) => {
                setForm((f) => ({ ...f, active: e.target.value === "yes" }));
                setDirty(true);
              }}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </L>
          <L label="Customizable?">
            <select
              className="admin-select"
              value={form.customizable ? "yes" : "no"}
              onChange={(e) => {
                setForm((f) => ({ ...f, customizable: e.target.value === "yes" }));
                setDirty(true);
              }}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </L>
        </div>
      </div>

      {/* Row 3 */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
          <L label="Made to Order?">
            <select
              className="admin-select"
              value={form.madeToOrder ? "yes" : "no"}
              onChange={(e) => {
                setForm((f) => ({ ...f, madeToOrder: e.target.value === "yes" }));
                setDirty(true);
              }}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </L>
          <L label="Lead Time (days)">
            <input
              type="number"
              className="admin-input"
              value={form.leadTimeDays}
              onChange={(e) => {
                setForm((f) => ({ ...f, leadTimeDays: +e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Rating Avg">
            <input
              type="number"
              className="admin-input"
              value={form.ratingAvg}
              onChange={(e) => {
                setForm((f) => ({ ...f, ratingAvg: +e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Reviews Count">
            <input
              type="number"
              className="admin-input"
              value={form.reviewsCount}
              onChange={(e) => {
                setForm((f) => ({ ...f, reviewsCount: +e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Upload Images">
            <input
              type="file"
              className="admin-input"
              multiple
              onChange={(e) => {
                setFiles(Array.from(e.target.files || []));
                setDirty(true);
              }}
            />
          </L>
          <L label="Thumbnail URL (gs:// or https)">
            <input
              className="admin-input"
              value={form.thumbnail}
              onChange={(e) => {
                setForm((f) => ({ ...f, thumbnail: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
        </div>
      </div>

      {/* Row 4 */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
          <L label="Width (cm)">
            <input
              type="number"
              className="admin-input"
              value={form.dimensionDefaults.width_cm}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  dimensionDefaults: { ...f.dimensionDefaults, width_cm: +e.target.value },
                }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Depth (cm)">
            <input
              type="number"
              className="admin-input"
              value={form.dimensionDefaults.depth_cm}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  dimensionDefaults: { ...f.dimensionDefaults, depth_cm: +e.target.value },
                }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Height (cm)">
            <input
              type="number"
              className="admin-input"
              value={form.dimensionDefaults.height_cm}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  dimensionDefaults: { ...f.dimensionDefaults, height_cm: +e.target.value },
                }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Color Options (Name:#HEX; …)">
            <input
              className="admin-input"
              value={colorText}
              onChange={(e) => {
                setColorText(e.target.value);
                setDirty(true);
              }}
            />
          </L>
          <L label="Material Options (Group|Name|Upcharge per line)">
            <textarea
              className="admin-input"
              value={materialsText}
              onChange={(e) => {
                setMaterialsText(e.target.value);
                setDirty(true);
              }}
            />
          </L>
          <L label="Tags (comma/newline)">
            <input
              className="admin-input"
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                setDirty(true);
              }}
            />
          </L>
        </div>
      </div>

      {/* Table */}
      <table className="admin-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Type</th>
            <th>Price</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.sku}</td>
              <td>{p.name}</td>
              <td>{p.slug}</td>
              <td>{p.baseType}</td>
              <td>{p.basePrice}</td>
              <td>{p.active ? "Yes" : "No"}</td>
              <td>
                <button className="admin-btn" onClick={() => onEdit(p)}>
                  Edit
                </button>
                <button
                  className="admin-btn"
                  onClick={async () => {
                    if (window.confirm(`Delete ${p.name}?`)) {
                      await deleteProduct(p.id);
                      setItems((prev) => prev.filter((x) => x.id !== p.id));
                    }
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
