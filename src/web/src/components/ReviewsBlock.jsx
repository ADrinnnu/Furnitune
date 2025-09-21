// src/components/ReviewsBlock.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, limit } from "firebase/firestore";

export default function ReviewsBlock({ firestore, productId, fallbackScanLimit = 200 }) {
  const [reviews, setReviews] = useState(null); // null = loading
  const [error, setError] = useState("");

  const tsToMillis = (ts) => {
    if (!ts) return 0;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (typeof ts?.seconds === "number") return ts.seconds * 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };
  const clampStars = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));

  useEffect(() => {
    let cancelled = false;
    if (!firestore || !productId) {
      setReviews([]);
      return () => {};
    }

    (async () => {
      try {
        // Fast path: new docs with productIds
        const q1 = query(
          collection(firestore, "reviews"),
          where("productIds", "array-contains", String(productId))
        );
        const snap1 = await getDocs(q1);

        let list = [];
        snap1.forEach((d) => {
          const r = d.data();
          list.push({
            id: d.id,
            userName: r.userName || "User",
            rating: clampStars(r.rating),
            message: String(r.message || ""),
            imageUrl: r.imageUrl || "",
            createdAt: r.createdAt,
          });
        });

        // Fallback: older docs without productIds → scan a bounded set
        if (list.length === 0) {
          const q2 = query(collection(firestore, "reviews"), limit(fallbackScanLimit));
          const snap2 = await getDocs(q2);
          const alt = [];
          snap2.forEach((d) => {
            const r = d.data();
            const items = Array.isArray(r.items) ? r.items : [];
            const match = items.some(
              (it) => (it?.productId || it?.id || "") === String(productId)
            );
            if (match) {
              alt.push({
                id: d.id,
                userName: r.userName || "User",
                rating: clampStars(r.rating),
                message: String(r.message || ""),
                imageUrl: r.imageUrl || "",
                createdAt: r.createdAt,
              });
            }
          });
          list = alt;
        }

        list.sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
        if (!cancelled) setReviews(list);
      } catch (e) {
        console.warn("ReviewsBlock error:", e);
        if (!cancelled) {
          setError("Unable to load reviews right now.");
          setReviews([]);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [firestore, productId, fallbackScanLimit]);

  if (reviews === null) {
    return (
      <div className="pd-reviews slab" style={{ marginTop: 16 }}>
        <h3>REVIEWS</h3>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="pd-reviews slab" style={{ marginTop: 16 }}>
      <h3>REVIEWS</h3>
      {!!error && <p className="muted">{error}</p>}

      {reviews.length === 0 ? (
        <p className="muted">No reviews yet.</p>
      ) : (
        <ul className="reviews-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {reviews.map((r) => {
            const dateMs = tsToMillis(r.createdAt);
            const dateStr = dateMs ? new Date(dateMs).toLocaleString() : null;
            const starCount = clampStars(r.rating);

            return (
              <li key={r.id} className="review-item" style={{ borderTop: "1px solid #eee", padding: "12px 0" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>{r.userName}</div>
                  {dateStr && <div className="muted" style={{ fontSize: 12 }}>{dateStr}</div>}
                </div>

                <div aria-label={`${starCount} out of 5 stars`} style={{ letterSpacing: 1, marginTop: 2 }}>
                  {"★".repeat(starCount)}
                  {"☆".repeat(5 - starCount)}
                </div>

                {r.message && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{r.message}</p>}

                {r.imageUrl && (
                  <div className="review-media" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => window.open(r.imageUrl, "_blank", "noopener")}
                      style={{ background: "transparent", border: 0, padding: 0, cursor: "zoom-in" }}
                      title="Open full image"
                    >
                      <img
                        src={r.imageUrl}
                        alt="Review"
                        style={{
                          width: 120,     // thumbnail size
                          height: 120,
                          objectFit: "cover",
                          borderRadius: 6,
                          display: "block",
                        }}
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
