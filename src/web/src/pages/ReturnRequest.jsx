
import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../firebase";
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function ReturnRequest() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("orderId");

  const db = useMemo(() => getFirestore(auth.app), []);
  const storage = useMemo(() => getStorage(auth.app), []);

  const [desc, setDesc] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!orderId) {
      alert("Missing order.");
      return;
    }
    if (!auth.currentUser?.uid) {
      alert("Please sign in.");
      return;
    }
    setSubmitting(true);
    try {
      
      const snap = await getDoc(doc(db, "orders", orderId));
      if (!snap.exists()) {
        alert("Order not found.");
        setSubmitting(false);
        return;
      }

      let imageUrl = null;
      if (file) {
        const p = `returns/${auth.currentUser.uid}/${orderId}/${Date.now()}_${file.name}`;
        const r = ref(storage, p);
        await uploadBytes(r, file);
        imageUrl = await getDownloadURL(r);
      }

      
      await addDoc(collection(db, "returns"), {
        userId: auth.currentUser.uid,
        orderId,
        message: desc.trim(),
        imageUrl,
        status: "requested",
        createdAt: serverTimestamp(),
      });

      
      await updateDoc(doc(db, "orders", orderId), {
        status: "refund",
        statusUpdatedAt: serverTimestamp(),
      });

      alert("Return/Refund request sent.");
      navigate(`/ordersummary?orderId=${orderId}`, { replace: true });
    } catch (e) {
      console.error(e);
      alert("Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="payment-container">
      { }
      <div className="payment-form">
        <h3>RETURN / REFUND</h3>
        <hr />
        <p>Please describe the issue and (optionally) upload a photo.</p>

        <label>Upload Photo (optional)</label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />

        <label style={{ marginTop: 12 }}>Message / Description</label>
        <textarea
          rows={6}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Tell us what went wrong…"
          style={{ width: "100%" }}
        />

        <div className="form-actions">
          <button className="back-btn" onClick={() => navigate(-1)} disabled={submitting}>
            GO BACK
          </button>
          <button className="order-btn" onClick={submit} disabled={submitting}>
            {submitting ? "SUBMITTING…" : "SUBMIT"}
          </button>
        </div>
      </div>

      { }
      <div className="order-summary">
        <h3>ORDER SUMMARY</h3>
        <div className="order-card" style={{ padding: 16 }}>
          <p className="muted">You can review details on the Order Summary after submitting.</p>
        </div>
      </div>
    </div>
  );
}
