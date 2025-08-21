// src/pages/Repair.jsx
import React, { useMemo, useRef, useState } from "react";
import "../Repair.css";

const FABRICS = [
  { id: "marble",  label: "Marble",    swatch: "#d9d3c7" },
  { id: "terra",   label: "Terracotta",swatch: "#b86a52" },
  { id: "cement",  label: "Cement",    swatch: "#6f6f6f" },
  { id: "harbour", label: "Harbour",   swatch: "#2c3e50" },
];

export default function Repair() {
  const [fabric, setFabric] = useState(FABRICS[0].id);
  const [notes, setNotes]   = useState("");
  const [images, setImages] = useState([]);
  const inputRef = useRef(null);

  const canSubmit = useMemo(
    () => images.length > 0 && notes.trim().length > 5,
    [images, notes]
  );

  const onFiles = (files) => {
    const arr = Array.from(files).slice(0, 6);
    const mapped = arr.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImages((prev) => [...prev, ...mapped]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  };

  const removeImage = (i) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[i]?.url);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const clearAll = () => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
  };

  const submit = () => {
    alert("Repair request placed! (check console for payload)");
    console.log({
      fabric,
      notes,
      files: images.map((i) => i.file.name),
      submittedAt: new Date().toISOString(),
    });
    setNotes("");
    clearAll();
    setFabric(FABRICS[0].id);
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
                <small>Up to 6 images</small>
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
            <button className="btn ghost" onClick={clearAll} disabled={!images.length}>
              Remove
            </button>
            <button className="btn" onClick={() => inputRef.current?.click()}>
              Upload
            </button>
          </div>

          <div className="info-box">
            <h4>Description</h4>
            <p>
              Upload clear photos and describe the damage (e.g. torn fabric, broken
              leg). Our team will review and contact you.
            </p>
            <h4>Steps</h4>
            <ol>
              <li>Upload photos & pick fabric.</li>
              <li>Describe issue & special instructions.</li>
              <li>Submit request, we’ll assess & schedule.</li>
              <li>Upload photos & pick fabric.</li>
              <li>Describe issue & special instructions.</li>
              <li>Submit request, we’ll assess & schedule.</li>
              <li>Upload photos & pick fabric.</li>
              <li>Describe issue & special instructions.</li>
              <li>Submit request, we’ll assess & schedule.</li>
              <li>Upload photos & pick fabric.</li>
              <li>Describe issue & special instructions.</li>
              <li>Submit request, we’ll assess & schedule.</li>
            </ol>
          </div>
        </div>

        {/* RIGHT */}
        <aside className="repair-right">
          <div className="card">
            <div className="card-title">1 • Choose Fabric</div>
            <div className="swatches">
              {FABRICS.map((f) => (
                <button
                  key={f.id}
                  className={`swatch ${fabric === f.id ? "active" : ""}`}
                  style={{ background: f.swatch }}
                  onClick={() => setFabric(f.id)}
                />
              ))}
            </div>
            <small>{FABRICS.find((x) => x.id === fabric)?.label}</small>
          </div>

          <div className="card">
            <div className="card-title">2 • Additional Notes</div>
            <textarea
              placeholder="Describe the issue, preferred schedule, pickup address, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button className="btn full" disabled={!canSubmit} onClick={submit}>
            PLACE ORDER
          </button>

          <small className="muted">This order will be reviewed before processing.</small>

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
