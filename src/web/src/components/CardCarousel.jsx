// src/components/CardCarousel.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

// Reuse the same styles AllFurnitures uses for .product-card, .product-image, etc.
import "../AllFurnitures.css";

// 🔽 Firestore (for filling in missing rating/review data)
import { firestore } from "../firebase";
import * as FS from "firebase/firestore";

function formatPrice(p) {
  if (p == null) return "";
  const n = typeof p === "number" ? p : Number(String(p).replace(/[^\d.]/g, ""));
  if (Number.isNaN(n)) return String(p);
  return n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
}

function clampStars(v) {
  const n = Number.isFinite(+v) ? +v : 0;
  return Math.max(0, Math.min(5, Math.floor(n))); // floor so 4.6 → ★★★★
}

function ProductCard({ item, idx }) {
  const to =
    item?.to || item?.link || item?.href || (item?.id ? `/product/${item.id}` : null);

  const img =
    item.image || item.img || item.photo || (Array.isArray(item.images) ? item.images[0] : "");

  const title = item.title || item.name || "Untitled";
  const price = item.price ?? item.basePrice ?? null;

  // ⭐ effective rating & count (either passed-in or fetched)
  const rating = clampStars(item.ratingAvg ?? item.rating ?? 0);
  const reviews = Number(item.reviewsCount ?? item.reviews ?? 0);

  return (
    <div className="product-card" key={item.id || idx}>
      {to ? (
        <Link to={to}>
          {img ? (
            <img
              src={img}
              alt={title}
              className="product-image"
              loading={idx > 2 ? "lazy" : "eager"}
            />
          ) : (
            <div className="product-image" style={{ background: "#eee" }} />
          )}
          <h3 className="product-title">{title}</h3>
          {price != null && <p className="product-price">{formatPrice(price)}</p>}
        </Link>
      ) : (
        <>
          {img ? (
            <img
              src={img}
              alt={title}
              className="product-image"
              loading={idx > 2 ? "lazy" : "eager"}
            />
          ) : (
            <div className="product-image" style={{ background: "#eee" }} />
          )}
          <h3 className="product-title">{title}</h3>
          {price != null && <p className="product-price">{formatPrice(price)}</p>}
        </>
      )}

      <div className="rating">
        <span style={{ color: "#f2b01e", letterSpacing: ".12rem" }}>
          {"★".repeat(rating)}
        </span>
        <p>({reviews} {reviews === 1 ? "Review" : "Reviews"})</p>
      </div>
    </div>
  );
}

export default function CardCarousel({ items = [], type = "product" }) {
  // 🔽 Local map of fetched ratings: { [id]: { avg, count } }
  const [ratings, setRatings] = useState({});

  // Fetch ratings only for items missing them
  useEffect(() => {
    if (type !== "product" || !Array.isArray(items) || items.length === 0) return;

    const missing = items.filter(
      (it) =>
        it?.id &&
        (it.ratingAvg == null || it.reviewsCount == null) &&
        ratings[it.id] == null
    );

    if (missing.length === 0) return;

    (async () => {
      const results = {};
      await Promise.all(
        missing.map(async (it) => {
          try {
            // 1) Try product aggregates
            const dref = FS.doc(firestore, "products", it.id);
            const ds = await FS.getDoc(dref);
            let avg = ds.exists() ? ds.data()?.ratingAvg : undefined;
            let count = ds.exists() ? ds.data()?.reviewsCount : undefined;

            // 2) Fallback: compute from subcollection
            if (!Number.isFinite(+avg) || !Number.isFinite(+count)) {
              const rsnap = await FS.getDocs(
                FS.collection(firestore, "products", it.id, "reviews")
              );
              count = rsnap.size;
              if (count > 0) {
                let total = 0;
                rsnap.forEach((r) => (total += Number(r.data()?.rating || 0)));
                avg = total / count;
              } else {
                avg = 0;
              }
            }

            results[it.id] = { avg: Number(avg) || 0, count: Number(count) || 0 };
          } catch (e) {
            console.warn("[CardCarousel] ratings fetch failed:", e);
            results[it.id] = { avg: 0, count: 0 };
          }
        })
      );
      setRatings((prev) => ({ ...prev, ...results }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, type]);

  // For collections, keep simple cards as before
  if (type !== "product") {
    return (
      <div className="carousel">
        {items.map((c, i) => {
          const to = c.to || c.link || c.href || "#";
          return (
            <Link key={c.id || i} to={to} className="card-link">
              <article className="card">
                <div className="media">
                  {c.img || c.image ? (
                    <img src={c.img || c.image} alt={c.title || "Collection"} />
                  ) : (
                    <div className="fallback" />
                  )}
                </div>
                <div className="body">
                  <h4 className="title">{c.title || "Collection"}</h4>
                  {c.description && <p className="description">{c.description}</p>}
                </div>
              </article>
            </Link>
          );
        })}
      </div>
    );
  }

  // Products: copy the AllFurnitures product container
  return (
    <div className="carousel">
      {items.map((item, idx) => {
        const fetched = item?.id ? ratings[item.id] : null;
        const merged = {
          ...item,
          ratingAvg:
            item.ratingAvg ?? item.rating ?? fetched?.avg ?? 0,
          reviewsCount:
            item.reviewsCount ?? item.reviews ?? fetched?.count ?? 0,
        };
        return <ProductCard key={item.id || idx} item={merged} idx={idx} />;
      })}
    </div>
  );
}
