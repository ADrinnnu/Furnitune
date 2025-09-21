// src/pages/Account.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { auth, storage } from "../firebase";
import { ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import "../Account.css";

function readExtras(uid) {
  try {
    const raw = localStorage.getItem(`profile:${uid}`);
    return raw ? JSON.parse(raw) : { address: "", phone: "" };
  } catch {
    return { address: "", phone: "" };
  }
}
function writeExtras(uid, extras) {
  localStorage.setItem(`profile:${uid}`, JSON.stringify(extras));
}

export default function Account() {
  const nav = useNavigate();
  const fileRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        nav("/login");
        return;
      }
      setUser(u);
      setName(u.displayName || "");
      setPhotoURL(u.photoURL || "");
      const extras = readExtras(u.uid);
      setAddress(extras.address || "");
      setPhone(extras.phone || "");
      setLoading(false);
    });
    return () => unsub();
  }, [nav]);

  const username = useMemo(() => {
    if (!user?.email) return "";
    return user.email.split("@")[0];
  }, [user]);

  const maskedEmail = useMemo(() => {
    if (!user?.email) return "";
    const [id, dom] = user.email.split("@");
    if (!id) return user.email;
    const first = id.slice(0, 1);
    const last = id.slice(-1);
    return `${first}${"*".repeat(Math.max(id.length - 2, 1))}${last}@${dom}`;
  }, [user]);

  const onUploadClick = () => fileRef.current?.click();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!auth.currentUser?.uid) {
      setMsg("Please sign in again.");
      return;
    }

    let localPreview;
    try {
      // instant local preview while uploading
      localPreview = URL.createObjectURL(f);
      setPhotoURL(localPreview);

      setMsg("Uploading picture…");
      const safeName = f.name.replace(/\s+/g, "_");
      const path = `avatars/${auth.currentUser.uid}/${Date.now()}_${safeName}`;
      const r = sRef(storage, path);

      // cacheable upload (faster repeat loads)
      await uploadBytes(r, f, {
        contentType: f.type,
        cacheControl: "public, max-age=31536000, immutable",
      });

      const url = await getDownloadURL(r);

      await updateProfile(auth.currentUser, { photoURL: url });

      // refresh the user ONCE here (not in navbar)
      try { await auth.currentUser.reload(); } catch {}

      setPhotoURL(url);
      setMsg("Profile picture updated.");
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      setMsg(err?.message || "Failed to update picture.");
    } finally {
      if (localPreview) URL.revokeObjectURL(localPreview);
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setMsg("");
    try {
      const newName = name.trim();
      if ((auth.currentUser.displayName || "") !== newName) {
        await updateProfile(auth.currentUser, { displayName: newName });
        try { await auth.currentUser.reload(); } catch {}
      }
      writeExtras(user.uid, { address: address.trim(), phone: phone.trim() });
      setMsg("Saved!");
    } catch (err) {
      setMsg(err.message || "Save failed.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 2000);
    }
  };

  const changePassword = async () => {
    if (!user?.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      setMsg("Password reset email sent.");
      setTimeout(() => setMsg(""), 2500);
    } catch (err) {
      setMsg(err.message || "Could not send reset email.");
    }
  };

  if (loading) {
    return (
      <div className="account-wrap container">
        <div className="account-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="account-wrap container">
      <h2 className="account-title">MY ACCOUNT</h2>

      <div className="account-grid">
        <section className="account-left">
          <div className="avatar">
            {photoURL ? (
              <img src={photoURL} alt="avatar" />
            ) : (
              <div className="avatar-fallback">
                {(name || username || "M").trim().charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="name-big">{name || username}</div>
          <button className="btn small" onClick={onUploadClick}>
            UPLOAD PICTURE
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFile}
          />
        </section>

        <section className="account-right">
          <div className="field-row">
            <label>USERNAME:</label>
            <input value={username} disabled />
          </div>

          <div className="field-row">
            <label>NAME:</label>
            <input
              value={name}
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field-row">
            <label>EMAIL:</label>
            <input value={user.email} disabled />
          </div>

          <div className="field-row">
            <label>ADDRESS:</label>
            <textarea
              value={address}
              placeholder="Street, Barangay, City, Province"
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
            />
          </div>

          <div className="field-row">
            <label>PHONE NUMBER:</label>
            <input
              value={phone}
              placeholder="+63 900 000 0000"
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="field-row password-row">
            <label>PASSWORD:</label>
            <input value={"•".repeat(10)} disabled />
            <button className="btn tiny ghost" onClick={changePassword}>
              CHANGE
            </button>
          </div>

          <div className="actions">
            <button className="btn" disabled={saving} onClick={save}>
              {saving ? "SAVING…" : "SAVE"}
            </button>
            {msg && <div className="msg">{msg}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
