// src/admin/pages/Products.jsx
import React, { useEffect, useState, useMemo } from "react";
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

/* ---------- Type → sizes / measurement config ---------- */
const TYPE_CONFIG = {
  Beds: {
    categorySlug: "beds",
    defaultDepartment: "bedroom",
    sizeOptions: [
      { id: "single", label: "Single" },
      { id: "double", label: "Double" },
      { id: "queen", label: "Queen" },
      { id: "king", label: "King" },
      { id: "cal-king", label: "California King" },
    ],
    measurementLabels: [
      "Single",
      "Double",
      "Queen",
      "King",
      "California King",
    ],
  },
  Sofas: {
    categorySlug: "sofas",
    defaultDepartment: "living-room",
    sizeOptions: [
      { id: "1seater", label: "1 Seater" },
      { id: "2seater", label: "2 Seater" },
      { id: "3seater", label: "3 Seater" },
      { id: "4seater", label: "4 Seater" },
    ],
    measurementLabels: ["1 Seater", "2 Seater", "3 Seater", "4 Seater"],
  },
  Chairs: {
    categorySlug: "chairs",
    defaultDepartment: "dining-room",
    sizeOptions: [
      { id: "standard", label: "Standard" },
      { id: "counter", label: "Counter" },
      { id: "bar", label: "Bar" },
    ],
    measurementLabels: ["Standard", "Counter", "Bar"],
  },
  Tables: {
    categorySlug: "tables",
    defaultDepartment: "dining-room",
    sizeOptions: [
      { id: "2p", label: "2 People" },
      { id: "4p", label: "4 People" },
      { id: "6p", label: "6 People" },
      { id: "8p", label: "8 People" },
    ],
    measurementLabels: ["2 People", "4 People", "6 People", "8 People"],
  },
  Sectionals: {
    categorySlug: "sectionals",
    defaultDepartment: "living-room",
    sizeOptions: [
      { id: "3seater", label: "3 Seater" },
      { id: "4seater", label: "4 Seater" },
      { id: "5seater", label: "5 Seater" },
      { id: "6seater", label: "6 Seater" },
    ],
    measurementLabels: ["3 Seater", "4 Seater", "5 Seater", "6 Seater"],
  },
  Ottomans: {
    categorySlug: "ottomons",
    defaultDepartment: "living-room",
    sizeOptions: [
      { id: "standard", label: "Standard" },
      { id: "cube", label: "Cube" },
      { id: "footstool", label: "Footstool" },
      { id: "cocktail", label: "Cocktail" },
    ],
    measurementLabels: ["Standard", "Cube", "Footstool", "Cocktail"],
  },
};

/* ---------- Helpers ---------- */
const toSlug = (s = "") =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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

const parseTags = (t = "") =>
  t
    .split(/,|\n|;/)
    .map((x) => x.trim())
    .filter(Boolean);

const formatDepartmentText = (value) => {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return "";
};

const parseDepartmentText = (t = "") => {
  const parts = t
    .split(/,|\n|;/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return parts;
};

/* small helper to upload a single file to a specific Storage path */
async function uploadFileToPath(appInstance, file, path) {
  const storage = getStorage(appInstance);
  const bucket = storage.app.options?.storageBucket || "";
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "application/octet-stream",
    });
    task.on(
      "state_changed",
      null,
      reject,
      async () => {
        try {
          // we keep using gs:// internally, same as your existing data
          const gsUrl = bucket ? `gs://${bucket}/${path}` : `gs:///${path}`;
          resolve(gsUrl);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/* ---------- Firestore CRUD ---------- */
const db = getFirestore(app);
const PRODUCTS = collection(db, "products");

async function listProducts() {
  const snap = await getDocs(
    query(PRODUCTS, orderBy("name", "asc"), limit(200))
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
    <div
      style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 4 }}
    >
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

  // base gallery files
  const [files, setFiles] = useState([]);

  // text inputs
  const [colorText, setColorText] = useState(
    "Red:#FF0000; White:#FFFFFF; Black:#000000; Brown:#A52A2A"
  );
  const [tagsText, setTagsText] = useState("wood, fabric");
  const [departmentText, setDepartmentText] = useState("bedroom");

  // structured variant fields
  const [measurementImages, setMeasurementImages] = useState({});
  const [imagesByOption, setImagesByOption] = useState({});

  // new: pending uploads for measurement + variants
  const [measurementFiles, setMeasurementFiles] = useState({});
  const [variantFiles, setVariantFiles] = useState({}); // {colorId: {sizeId: File}}

  const [form, setForm] = useState({
    id: undefined,
    name: "",
    slug: "",
    baseType: "Beds", // dropdown
    categorySlug: "beds",
    collection: "",
    departmentSlug: "bedroom", // will be derived from departmentText
    basePrice: 0,
    active: true,
    customizable: true,
    hideColor: false,
    priceStrategy: "lookup",
    madeToOrder: true,
    leadTimeDays: 14,
    dimensionDefaults: { width_cm: 0, depth_cm: 0, height_cm: 0 }, // kept for data, no UI
    images: [],
    thumbnail: "",
    defaultImagePath: "",
    description: "",
    isBestSeller: false,
    isNew: false,
    // rating fields intentionally not edited here
    ratingAvg: undefined,
    ratingSum: undefined,
    reviewsCount: undefined,
  });

  // Furniture type filter tabs
  const [activeType, setActiveType] = useState("ALL");

  useEffect(() => {
    listProducts().then((rows) => setItems(rows || []));
  }, []);

  const sizeConfig =
    TYPE_CONFIG[form.baseType] || {
      categorySlug: form.categorySlug || "",
      defaultDepartment: form.departmentSlug || "",
      sizeOptions: [],
      measurementLabels: [],
    };

  const colorDefs = useMemo(
    () => (form.baseType === "Tables" ? [] : parseColorText(colorText)),
    [colorText, form.baseType]
  );

  const onEdit = (p) => {
    setDirty(false);
    setFiles([]);
    setMeasurementFiles({});
    setVariantFiles({});

    const {
      ratingAvg,
      ratingSum,
      reviewsCount,
      createdAt,
      updatedAt,
      ...rest
    } = p || {};

    setColorText(
      (rest.colorOptions || [])
        .map((c) => `${c.name}:${c.hex}`)
        .join("; ")
    );
    setTagsText((rest.tags || []).join(", "));
    setDepartmentText(formatDepartmentText(rest.departmentSlug));
    setMeasurementImages(rest.measurementImages || {});
    setImagesByOption(rest.imagesByOption || {});

    setForm((f) => ({
      ...f,
      ...rest,
    }));
  };

  // upload gallery images
  async function uploadAllImages(folderKey) {
    if (!files.length) return { gs: [], urls: [] };

    await requireAuthUser();

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
              const url = await getDownloadURL(task.snapshot.ref);
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
      await requireAuthUser();

      const slug = form.slug || toSlug(form.name) || form.id || "";

      const sizeOptions = sizeConfig.sizeOptions || [];

      const colorsArray =
        form.baseType === "Tables" ? [] : parseColorText(colorText || "");

      const optionsColors = colorsArray.map((c) => ({
        id: toSlug(c.name),
        label: c.name,
        hex: c.hex,
      }));

      // start payload from state
      let measurementPayload = { ...measurementImages };
      let imagesByOptionPayload = { ...imagesByOption };

      // 1) upload measurement files (default + per size)
      for (const [labelKey, file] of Object.entries(measurementFiles || {})) {
        if (!file) continue;
        const typeSlug =
          (form.categorySlug || form.baseType || "other").toString().toLowerCase();
        const sizeSlug = labelKey === "default" ? "default" : toSlug(labelKey);
        const safe = (file.name || "measure").replace(/\s+/g, "_");
        const path = `measurementImage/${typeSlug}/${sizeSlug}/${Date.now()}-${safe}`;
        const gsUrl = await uploadFileToPath(app, file, path);
        measurementPayload = {
          ...measurementPayload,
          [labelKey]: gsUrl,
        };
      }

      // 2) upload per color+size variant files into imagesByOption
      for (const [colorId, sizeMap] of Object.entries(variantFiles || {})) {
        if (!sizeMap) continue;
        for (const [sizeId, file] of Object.entries(sizeMap)) {
          if (!file) continue;

          const sizeDef =
            sizeOptions.find((s) => s.id === sizeId) || null;
          const sizeSlug = sizeDef ? toSlug(sizeDef.label) : sizeId;
          const safe = (file.name || "variant").replace(/\s+/g, "_");
          const path = `products/${slug}/sizes/${sizeSlug}/colors/${colorId}/${Date.now()}-${safe}`;
          const gsUrl = await uploadFileToPath(app, file, path);

          const colorNode = {
            ...(imagesByOptionPayload[colorId] || {}),
          };
          const arr = Array.isArray(colorNode[sizeId])
            ? [...colorNode[sizeId]]
            : [];
          arr[0] = gsUrl; // keep it as [gs://...]
          colorNode[sizeId] = arr;
          imagesByOptionPayload = {
            ...imagesByOptionPayload,
            [colorId]: colorNode,
          };
        }
      }

      const payload = {
        ...form,
        slug,
        basePrice: Number(form.basePrice) || 0,
        leadTimeDays: Number(form.leadTimeDays) || 0,
        dimensionDefaults: {
          width_cm: Number(form.dimensionDefaults?.width_cm) || 0,
          depth_cm: Number(form.dimensionDefaults?.depth_cm) || 0,
          height_cm: Number(form.dimensionDefaults?.height_cm) || 0,
        },
        // colorOptions only if not Tables
        colorOptions:
          form.baseType === "Tables" ? [] : colorsArray.map((c) => ({ ...c })),
        tags: parseTags(tagsText),
        departmentSlug: parseDepartmentText(departmentText),
        measurementImages: measurementPayload,
        options: {
          sizes: sizeOptions,
        },
        sizes: sizeOptions,
        imagesByOption: imagesByOptionPayload,
      };

      if (optionsColors.length && form.baseType !== "Tables") {
        payload.options.colors = optionsColors;
      }

      // force category & department if empty (can still be overridden by typing)
      if (!payload.categorySlug && TYPE_CONFIG[form.baseType]) {
        payload.categorySlug = TYPE_CONFIG[form.baseType].categorySlug;
      }

      payload.active = !!form.active;
      payload.customizable = !!form.customizable;
      payload.hideColor =
        form.baseType === "Tables" ? true : !!form.hideColor;
      payload.madeToOrder = !!form.madeToOrder;
      payload.isBestSeller = !!form.isBestSeller;
      payload.isNew = !!form.isNew;

      // rating fields are *not* set here — they stay review-driven

      // images upload for base gallery
      if (files.length) {
        const { gs, urls } = await uploadAllImages(payload.slug || "no-key");
        payload.images = gs;
        payload.thumbnail = gs[0] || "";
        payload.defaultImagePath = gs[0] || "";
        payload.imageUrls = urls;
        payload.thumbnailUrl = urls[0] || "";
      } else {
        if (Array.isArray(form.images)) payload.images = form.images;
        if (Array.isArray(form.imageUrls)) payload.imageUrls = form.imageUrls;
        if (form.thumbnail) payload.thumbnail = form.thumbnail;
        if (form.thumbnailUrl) payload.thumbnailUrl = form.thumbnailUrl;
        if (form.defaultImagePath)
          payload.defaultImagePath = form.defaultImagePath;
      }

      if (form.id) {
        const updated = await updateProduct(form.id, payload);
        setItems((prev) =>
          prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
        );
      } else {
        const created = await createProduct(payload);
        setItems((prev) => [created, ...prev]);
      }

      // reset form after save/create
      setForm((f) => ({
        ...f,
        id: undefined,
        name: "",
        slug: "",
        basePrice: 0,
        images: [],
        thumbnail: "",
        defaultImagePath: "",
        description: "",
        baseType: "Beds",
        categorySlug: "beds",
        collection: "",
        departmentSlug: "bedroom",
        hideColor: false,
        isBestSeller: false,
        isNew: false,
        dimensionDefaults: { width_cm: 0, depth_cm: 0, height_cm: 0 },
      }));
      setFiles([]);
      setColorText(
        "Red:#FF0000; White:#FFFFFF; Black:#000000; Brown:#A52A2A"
      );
      setTagsText("wood, fabric");
      setDepartmentText("bedroom");
      setMeasurementImages({});
      setMeasurementFiles({});
      setImagesByOption({});
      setVariantFiles({});
    } catch (e) {
      console.error(e);
      alert(e?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // unique base types for tabs
  const baseTypes = useMemo(() => {
    const set = new Set();
    items.forEach((p) => {
      if (p.baseType) set.add(p.baseType);
    });
    return Array.from(set).sort();
  }, [items]);

  // items filtered by active tab
  const filteredItems = useMemo(() => {
    if (!activeType || activeType === "ALL") return items;
    return items.filter((p) => p.baseType === activeType);
  }, [items, activeType]);

  return (
    <div>
      <ConfirmLeave when={dirty} />

      {/* Row 1: basic info */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 8,
          }}
        >
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
          <L label="Collection">
            <input
              className="admin-input"
              value={form.collection || ""}
              onChange={(e) => {
                setForm((f) => ({ ...f, collection: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
          <L label="Save">
            <button
              className="admin-btn primary"
              onClick={save}
              disabled={uploading}
            >
              {form.id
                ? uploading
                  ? "Saving…"
                  : "Save"
                : uploading
                ? "Creating…"
                : "Create"}
            </button>
          </L>
        </div>
      </div>

      {/* Row 2: type + slugs */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 8,
          }}
        >
          <L label="Furniture Type">
            <select
              className="admin-select"
              value={form.baseType}
              onChange={(e) => {
                const nextType = e.target.value;
                const cfg = TYPE_CONFIG[nextType];
                setForm((f) => ({
                  ...f,
                  baseType: nextType,
                  categorySlug:
                    f.categorySlug ||
                    (cfg ? cfg.categorySlug : f.categorySlug),
                }));
                if (!departmentText && cfg?.defaultDepartment) {
                  setDepartmentText(cfg.defaultDepartment);
                }
                setDirty(true);
              }}
            >
              {Object.keys(TYPE_CONFIG).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
          <L label="Department Slug(s) (comma or newline)">
            <textarea
              className="admin-input"
              rows={2}
              value={departmentText}
              onChange={(e) => {
                setDepartmentText(e.target.value);
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
                setForm((f) => ({
                  ...f,
                  customizable: e.target.value === "yes",
                }));
                setDirty(true);
              }}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </L>
          <L label="Default Image Path (gs://)">
            <input
              className="admin-input"
              value={form.defaultImagePath || ""}
              onChange={(e) => {
                setForm((f) => ({ ...f, defaultImagePath: e.target.value }));
                setDirty(true);
              }}
            />
          </L>
        </div>
      </div>

      {/* Row 3: flags + upload */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 8,
          }}
        >
          <L label="Made to Order?">
            <select
              className="admin-select"
              value={form.madeToOrder ? "yes" : "no"}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  madeToOrder: e.target.value === "yes",
                }));
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
          <L label="Hide Color (frontend)?">
            <select
              className="admin-select"
              value={form.hideColor || form.baseType === "Tables" ? "yes" : "no"}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  hideColor: e.target.value === "yes",
                }));
                setDirty(true);
              }}
              disabled={form.baseType === "Tables"}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </L>
          <L label="Best Seller?">
            <select
              className="admin-select"
              value={form.isBestSeller ? "yes" : "no"}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  isBestSeller: e.target.value === "yes",
                }));
                setDirty(true);
              }}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </L>
          <L label="Is New?">
            <select
              className="admin-select"
              value={form.isNew ? "yes" : "no"}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  isNew: e.target.value === "yes",
                }));
                setDirty(true);
              }}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </L>
          <L label="Upload Images (base / gallery)">
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
        </div>
      </div>

      {/* Row 4: colors + tags (color hidden for tables) */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 8,
          }}
        >
          {form.baseType !== "Tables" && (
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
          )}
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
          <L label="Available Sizes (auto by furniture type)">
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {sizeConfig.sizeOptions && sizeConfig.sizeOptions.length ? (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {sizeConfig.sizeOptions.map((s) => (
                    <li key={s.id}>
                      {s.label} <span style={{ opacity: 0.6 }}>({s.id})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span>Choose a furniture type to see sizes.</span>
              )}
            </div>
          </L>
        </div>
      </div>

      {/* Row 5: description + measurement images per size (file uploads) */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 8,
          }}
        >
          <L label="Description (supports line breaks)">
            <textarea
              className="admin-input"
              rows={8}
              value={form.description}
              onChange={(e) => {
                setForm((f) => ({ ...f, description: e.target.value }));
                setDirty(true);
              }}
              placeholder={`E.g.\nAurora Sectional: description, customization, sizes...`}
            />
          </L>
          <div style={{ display: "grid", gap: 8 }}>
            <L label="Measurement Images – Default">
              <div style={{ display: "grid", gap: 4 }}>
                {measurementImages.default && (
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.7,
                      wordBreak: "break-all",
                    }}
                  >
                    Current: {measurementImages.default}
                  </div>
                )}
                <input
                  type="file"
                  className="admin-input"
                  onChange={(e) => {
                    const file = (e.target.files || [])[0] || null;
                    setMeasurementFiles((prev) => ({
                      ...prev,
                      default: file,
                    }));
                    setDirty(true);
                  }}
                />
              </div>
            </L>
            <L label="Measurement Images per Size">
              <div style={{ display: "grid", gap: 6 }}>
                {sizeConfig.measurementLabels &&
                sizeConfig.measurementLabels.length ? (
                  sizeConfig.measurementLabels.map((label) => (
                    <div
                      key={label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 2fr",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          paddingRight: 4,
                        }}
                      >
                        {label}
                        {measurementImages[label] && (
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 400,
                              opacity: 0.7,
                              wordBreak: "break-all",
                            }}
                          >
                            Current: {measurementImages[label]}
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        className="admin-input"
                        onChange={(e) => {
                          const file = (e.target.files || [])[0] || null;
                          setMeasurementFiles((prev) => ({
                            ...prev,
                            [label]: file,
                          }));
                          setDirty(true);
                        }}
                      />
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Choose a furniture type to configure measurement images.
                  </div>
                )}
              </div>
            </L>
          </div>
        </div>
      </div>

      {/* Row 6: Variant images per color + size (imagesByOption) */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <L label="Variant Images (imagesByOption: per color + size)">
          {!colorDefs.length || !sizeConfig.sizeOptions.length ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Add colors (for non-table types) and select a furniture type to
              configure images by color and size.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {colorDefs.map((c) => {
                const colorId = toSlug(c.name);
                return (
                  <div
                    key={colorId}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: 8,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        Color: {c.name}{" "}
                        <span style={{ opacity: 0.6 }}>({colorId})</span>
                      </div>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "999px",
                          border: "1px solid #ccc",
                          background: c.hex,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit,minmax(220px,1fr))",
                        gap: 6,
                      }}
                    >
                      {sizeConfig.sizeOptions.map((sz) => {
                        const currentGs =
                          imagesByOption?.[colorId]?.[sz.id]?.[0] || "";
                        return (
                          <div key={sz.id}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                marginBottom: 2,
                              }}
                            >
                              {sz.label}{" "}
                              <span style={{ opacity: 0.6 }}>({sz.id})</span>
                              {currentGs && (
                                <div
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 400,
                                    opacity: 0.7,
                                    wordBreak: "break-all",
                                  }}
                                >
                                  Current: {currentGs}
                                </div>
                              )}
                            </div>
                            <input
                              type="file"
                              className="admin-input"
                              onChange={(e) => {
                                const file =
                                  (e.target.files || [])[0] || null;
                                setVariantFiles((prev) => {
                                  const next = { ...prev };
                                  const inner = {
                                    ...(next[colorId] || {}),
                                  };
                                  inner[sz.id] = file;
                                  next[colorId] = inner;
                                  return next;
                                });
                                setDirty(true);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </L>
      </div>

      {/* Furniture Type Tabs for table below */}
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            className="admin-btn"
            onClick={() => setActiveType("ALL")}
            style={
              activeType === "ALL"
                ? { fontWeight: 700, textDecoration: "underline" }
                : {}
            }
          >
            All
          </button>
          {baseTypes.map((type) => (
            <button
              key={type}
              className="admin-btn"
              onClick={() => setActiveType(type)}
              style={
                activeType === type
                  ? { fontWeight: 700, textDecoration: "underline" }
                  : {}
              }
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Type</th>
            <th>Collection</th>
            <th>Price</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.slug}</td>
              <td>{p.baseType}</td>
              <td>{p.collection}</td>
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
