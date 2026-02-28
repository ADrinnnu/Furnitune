// src/pages/Repair.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../Repair.css";

import { auth } from "../firebase";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

const MAX_UPLOADS = 5;

// Added specific sizes and price modifiers for each furniture type
const FURNITURE_TYPES = [
  { 
    id: "bed", 
    label: "Bed", 
    price: 3200,
    sizes: [
      { id: "single", label: "Single", priceAdd: 0 },
      { id: "double", label: "Double", priceAdd: 500 },
      { id: "queen", label: "Queen", priceAdd: 1000 },
      { id: "king", label: "King", priceAdd: 1500 },
      { id: "custom", label: "Custom", priceAdd: 2000 }
    ]
  },
  { 
    id: "chair", 
    label: "Chair", 
    price: 1200,
    sizes: [
      { id: "standard", label: "Standard", priceAdd: 0 },
      { id: "counter", label: "Counter", priceAdd: 300 },
      { id: "bar", label: "Bar", priceAdd: 500 },
      { id: "custom", label: "Custom", priceAdd: 800 }
    ]
  },
  { 
    id: "dining_table", 
    label: "Dining Table", 
    price: 2800,
    sizes: [
      { id: "2_people", label: "2 people", priceAdd: 0 },
      { id: "4_people", label: "4 people", priceAdd: 600 },
      { id: "6_people", label: "6 people", priceAdd: 1200 },
      { id: "8_people", label: "8 people", priceAdd: 1800 },
      { id: "custom", label: "Custom", priceAdd: 2500 }
    ]
  },
  { 
    id: "ottoman", 
    label: "Ottoman", 
    price: 1400,
    sizes: [
      { id: "standard", label: "Standard", priceAdd: 0 },
      { id: "cube", label: "Cube", priceAdd: 200 },
      { id: "footstool", label: "Footstool", priceAdd: 100 },
      { id: "cocktail", label: "Cocktail", priceAdd: 500 },
      { id: "custom", label: "Custom", priceAdd: 600 }
    ]
  },
  { 
    id: "sofa", 
    label: "Sofa", 
    price: 1600,
    sizes: [
      { id: "2_seater", label: "2 Seater", priceAdd: 0 },
      { id: "3_seater", label: "3 Seater", priceAdd: 800 },
      { id: "4_seater", label: "4 Seater", priceAdd: 1500 },
      { id: "custom", label: "Custom", priceAdd: 2000 }
    ]
  },
  { 
    id: "sectionals", 
    label: "Sectionals", 
    price: 3600,
    sizes: [
      { id: "3_seater", label: "3 Seater", priceAdd: 0 },
      { id: "5_seater", label: "5 Seater", priceAdd: 1500 },
      { id: "6_seater", label: "6 Seater", priceAdd: 2200 },
      { id: "7_seater", label: "7 Seater", priceAdd: 2900 },
      { id: "custom", label: "Custom", priceAdd: 3500 }
    ]
  },
];

const COVER_MATERIALS = [
  { id: "fabric",  label: "Fabrics", price: 800 },
  { id: "leather", label: "Leather", price: 1500 },
  { id: "none",    label: "None",    price: 0 },
];
const FRAME_MATERIALS = [
  { id: "metal", label: "Metal", price: 1000 },
  { id: "wood",  label: "Wood",  price: 800 },
  { id: "none",  label: "None",  price: 0 },
];

function fmtPHP(n) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);
  } catch { return `₱${Number(n) || 0}`; }
}

export default function Repair() {
  const navigate = useNavigate();
  const db = useMemo(() => getFirestore(), []);
  const storage = useMemo(() => getStorage(), []);

  const [typeId, setTypeId] = useState(FURNITURE_TYPES[0].id);
  const [sizeId, setSizeId] = useState(FURNITURE_TYPES[0].sizes[0].id);
  const [coverId, setCoverId] = useState(COVER_MATERIALS[0].id);
  const [frameId, setFrameId] = useState(FRAME_MATERIALS[0].id);

  const [notes, setNotes]   = useState("");
  const [images, setImages] = useState([]); // [{file, url}]
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const inputRef = useRef(null);

  const selectedType  = FURNITURE_TYPES.find(t => t.id === typeId);
  const selectedSize  = selectedType?.sizes.find(s => s.id === sizeId) || selectedType?.sizes[0];
  const selectedCover = COVER_MATERIALS.find(c => c.id === coverId);
  const selectedFrame = FRAME_MATERIALS.find(f => f.id === frameId);

  // Automatically select the first size whenever the furniture type changes
  useEffect(() => {
      if (selectedType && selectedType.sizes.length > 0) {
          setSizeId(selectedType.sizes[0].id);
      }
  }, [typeId]);

  const total =
    (selectedType?.price || 0) +
    (selectedSize?.priceAdd || 0) +
    (selectedCover?.price || 0) +
    (selectedFrame?.price || 0);

  // files
  const onFiles = (files) => {
    const remaining = Math.max(0, MAX_UPLOADS - images.length);
    if (!remaining) return;
    const arr = Array.from(files).slice(0, remaining);
    const mapped = arr.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImages((prev) => [...prev, ...mapped]);
  };
  const onDrop = (e) => { e.preventDefault(); if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files); };
  const removeImage = (i) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[i]?.url);
      return prev.filter((_, idx) => idx !== i);
    });
  };
  const clearAll = () => { images.forEach(i => URL.revokeObjectURL(i.url)); setImages([]); };

  async function uploadAllImages(uid, draftId) {
    const files = images.map(i => i.file);
    setProgress({ done: 0, total: files.length });
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `repairs/${uid}/${draftId}/${Date.now()}_${i}_${file.name}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      urls.push(url);
      setProgress({ done: i + 1, total: files.length });
    }
    return urls;
  }

  const submit = async () => {
    // Allow 1–5 photos; notes optional
    if (images.length < 1 || images.length > MAX_UPLOADS) {
      alert(`Please upload between 1 and ${MAX_UPLOADS} photos.`);
      return;
    }

    // 🔒 Require login first; DO NOT create anonymous users
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
      const next = "/Repair";
      sessionStorage.setItem("post_login_redirect", next);
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    setSubmitting(true);
    try {
      const uid   = user.uid;
      const email = user.email ?? auth.currentUser?.email ?? null;

      // create doc id first
      const docRef = doc(collection(db, "repairs"));

      // upload images
      const imageUrls = await uploadAllImages(uid, docRef.id);

      // We combine the type and size string together so admin easily reads "Bed (Queen)"
      const formattedTypeLabel = `${selectedType?.label || ""} (${selectedSize?.label || ""})`;

      // write repair doc
      await setDoc(docRef, {
        typeId,
        typeLabel: formattedTypeLabel,
        typePrice: selectedType?.price ?? 0,

        sizeId: selectedSize?.id || "",
        sizeLabel: selectedSize?.label || "",
        sizePriceAdd: selectedSize?.priceAdd ?? 0,

        coverMaterialId: coverId,
        coverMaterialLabel: selectedCover?.label || "",
        coverMaterialPrice: selectedCover?.price ?? 0,

        frameMaterialId: frameId,
        frameMaterialLabel: selectedFrame?.label || "",
        frameMaterialPrice: selectedFrame?.price ?? 0,

        images: imageUrls,
        imagesCount: imageUrls.length,

        total: total ?? 0,
        notes: (notes || "").trim(),
        userId: uid,
        contactEmail: email,
        status: "new",
        createdAt: serverTimestamp(),
      });

      // ➜ jump straight to Checkout
      navigate(`/Checkout?repairId=${docRef.id}`);

      // cleanup state
      setNotes("");
      clearAll();
      setTypeId(FURNITURE_TYPES[0].id);
      setCoverId(COVER_MATERIALS[0].id);
      setFrameId(FRAME_MATERIALS[0].id);
      setProgress({ done: 0, total: 0 });
    } catch (e) {
      console.error("Repair submit error:", e);
      const msg =
        (e?.code || "").includes("storage")
          ? "Photo upload failed. Check Firebase Storage rules for write access."
          : (e?.code || "").includes("operation-not-allowed")
          ? "Anonymous sign-in is disabled. Please sign in first."
          : (e?.code || "").includes("permission")
          ? "You don’t have permission. Make sure you are signed in and your Firestore rules allow creating repairs."
          : e?.message || "Failed to place repair request.";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="repair container">
      <h2 className="repair-title">REPAIR MANAGEMENT</h2>

      <div className="repair-layout">
        {/* LEFT */}
        <div className="repair-left">
          <div
            className="upload-box"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            {images.length === 0 ? (
              <div className="upload-empty">
                <span className="big-icon">🖼️</span>
                <p>Drop photos here or click to upload</p>
                <small>Up to {MAX_UPLOADS} images • clear shots of the issue</small>
              </div>
            ) : (
              <div className="thumbs">
                {images.map((img, i) => (
                  <div key={i} className="thumb">
                    <img src={img.url} alt="" />
                    <button onClick={(e)=>{e.stopPropagation(); removeImage(i);}}>×</button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              hidden
              accept="image/*"
              multiple
              onChange={(e) => onFiles(e.target.files)}
            />
          </div>

          <div className="upload-actions">
            <button className="btn ghost" onClick={clearAll} disabled={!images.length || submitting}>
              Remove
            </button>
            <button className="btn" onClick={() => inputRef.current?.click()} disabled={images.length >= MAX_UPLOADS || submitting}>
              Upload
            </button>
          </div>

          <div className="info-box">
            <h4>Description</h4>
            <p>Upload clear photos and describe the damage (e.g. torn fabric, broken leg). Our team will review and contact you.</p>
            <h4>Steps</h4>
            <ol>
              <li>Upload 1–{MAX_UPLOADS} photos.</li>
              <li>Select furniture type & size.</li>
              <li>Choose cover & frame materials.</li>
              <li>Describe issue & special instructions.</li>
              <li>Submit request, we’ll assess & schedule.</li>
            </ol>
          </div>
        </div>

        {/* RIGHT */}
        <aside className="repair-right">
          <div className="card1">
            <div className="card-title">1 - Furniture Type</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FURNITURE_TYPES.map((t) => (
                <button
                  key={t.id}
                  className={`btn ${typeId === t.id ? "" : "ghost"}`}
                  onClick={() => setTypeId(t.id)}
                  type="button"
                  title={`${t.label} ${fmtPHP(t.price)}`}
                >
                  {t.label} — {fmtPHP(t.price)}
                </button>
              ))}
            </div>
            <small className="muted1">Selected: {selectedType?.label}</small>

            <hr />

            {/* DYNAMIC SIZE SECTION */}
            <div className="card-title">2 - Select Size</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {selectedType?.sizes.map((s) => (
                <button
                  key={s.id}
                  className={`btn ${sizeId === s.id ? "" : "ghost"}`}
                  onClick={() => setSizeId(s.id)}
                  type="button"
                  title={`${s.label} ${s.priceAdd ? `(+${fmtPHP(s.priceAdd)})` : ""}`}
                >
                  {s.label}{s.priceAdd ? ` — +${fmtPHP(s.priceAdd)}` : ""}
                </button>
              ))}
            </div>
            <small className="muted1">Selected: {selectedSize?.label}</small>

            <hr />

            <div className="card-title">3 - Cover Material</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {COVER_MATERIALS.map((c) => (
                <button
                  key={c.id}
                  className={`btn ${coverId === c.id ? "" : "ghost"}`}
                  onClick={() => setCoverId(c.id)}
                  type="button"
                  title={`${c.label} ${c.price ? `(+${fmtPHP(c.price)})` : ""}`}
                >
                  {c.label}{c.price ? ` — +${fmtPHP(c.price)}` : ""}
                </button>
              ))}
            </div>
            <small className="muted1">Selected: {selectedCover?.label}</small>

            <hr />

            <div className="card-title">4 - Frame Material</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FRAME_MATERIALS.map((f) => (
                <button
                  key={f.id}
                  className={`btn ${frameId === f.id ? "" : "ghost"}`}
                  onClick={() => setFrameId(f.id)}
                  type="button"
                  title={`${f.label} ${f.price ? `(+${fmtPHP(f.price)})` : ""}`}
                >
                  {f.label}{f.price ? ` — +${fmtPHP(f.price)}` : ""}
                </button>
              ))}
            </div>
            <small className="muted1">Selected: {selectedFrame?.label}</small>

            <hr />

            <div className="card-title">5 - Additional Notes</div>
            <textarea
              placeholder="Describe the issue, preferred schedule, pickup address, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />

            <hr />

            <div className="kv" style={{ marginBottom: 8 }}>
              <label>Total Estimate</label>
              <div className="mono strong">{fmtPHP(total)}</div>
            </div>

            <button className="btn full" disabled={submitting} onClick={submit}>
              {submitting
                ? `Submitting…${progress.total ? ` ${progress.done}/${progress.total}` : ""}`
                : "PLACE ORDER"}
            </button>

            <small className="muted1" style={{display: 'block', marginTop: 8}}>
              *Final price subject to review. This order will be assessed before processing.
            </small>
          </div>

          <div className="card">
            <div className="card-title">Need Assistance?</div>
            <ul>
              <li>💬 Live Chat</li>
              <li>📞 0123-321-210</li>
              <li>✉️ Furnitune@sample.com</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}