// src/pages/Collections.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";

/* ⬇️ Replace pano.png with your two photos */
import banner1 from "../assets/CollectionImage1.png";
import banner2 from "../assets/CollectionImage2.png";

import { firestore, storage } from "../firebase";
import * as FS from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import "../Collections.css";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function objectPathFromAnyStorageUrl(u) {
  if (!u || typeof u !== "string") return null;
  if (/^gs:\/\//i.test(u)) {
    const without = u.replace(/^gs:\/\//i, "");
    const i = without.indexOf("/");
    return i > -1 ? without.slice(i + 1) : null;
  }
  if (u.includes("firebasestorage.googleapis.com")) {
    const m = u.match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  if (!/^https?:\/\//i.test(u)) return u;
  return null;
}

async function toDownloadUrl(val) {
  if (!val) return "";
  try {
    const objPath = objectPathFromAnyStorageUrl(val);
    if (objPath) return await getDownloadURL(ref(storage, objPath));
    return val;
  } catch {
    return "";
  }
}

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

/* ───────────────── Collection metadata ─────────────────
   Use two banners for the hero. If you only have one image,
   it will gracefully render the single banner.
*/
const COLLECTION_META = {
  "comfort-core": {
    title: "COMFORT CORE COLLECTION",
    banners: [banner1, banner2],
    description:
      "Experience unmatched comfort with cozy sofas and recliners designed for everyday relaxation.",
    synonyms: ["Comfort Core", "Comfort Core Collection"],
  },
  "social-sitting": {
    title: "SOCIAL SITTING COLLECTION",
    banners: [banner1, banner2],
    description:
      "Perfect for gatherings, this collection offers stylish seating that brings people together.",
    synonyms: ["Social Sitting", "Social Sitting Collection"],
  },
  "rest-recharge": {
    title: "REST & RECHARGE",
    banners: [banner1, banner2],
    description:
      "Beds and loungers made for ultimate rest, giving you the energy to face each day refreshed.",
    synonyms: ["Rest & Recharge", "Rest and Recharge", "Rest Recharge"],
  },
  "sit-stay": {
    title: "SIT & STAY",
    banners: [banner1, banner2],
    description:
      "Durable and versatile chairs built for long-lasting comfort and style.",
    synonyms: ["Sit & Stay", "Sit Stay"],
  },
};

async function fetchProductsByCollection(metaKey, meta) {
  const titles = uniq([meta.title, ...(meta.synonyms || []), metaKey]);
  const slugVals = uniq(titles.map(norm));

  const results = new Map();
  const colRef = FS.collection(firestore, "products");

  const addDocs = (snap) => {
    snap?.docs?.forEach((d) => results.set(d.id, d));
  };

  const tasks = [];

  if (titles.length) {
    tasks.push(
      FS.getDocs(
        FS.query(colRef, FS.where("collection", "in", titles.slice(0, 10)))
      )
        .then(addDocs)
        .catch(() => {})
    );
    tasks.push(
      FS.getDocs(
        FS.query(
          colRef,
          FS.where("collections", "array-contains-any", titles.slice(0, 10))
        )
      )
        .then(addDocs)
        .catch(() => {})
    );
  }

  if (slugVals.length) {
    tasks.push(
      FS.getDocs(
        FS.query(
          colRef,
          FS.where("collectionSlug", "in", slugVals.slice(0, 10))
        )
      )
        .then(addDocs)
        .catch(() => {})
    );
    tasks.push(
      FS.getDocs(
        FS.query(
          colRef,
          FS.where("collectionSlugs", "array-contains-any", slugVals.slice(0, 10))
        )
      )
        .then(addDocs)
        .catch(() => {})
    );
    tasks.push(
      FS.getDocs(
        FS.query(colRef, FS.where("tags", "array-contains-any", slugVals.slice(0, 10)))
      )
        .then(addDocs)
        .catch(() => {})
    );
    tasks.push(
      FS.getDocs(
        FS.query(colRef, FS.where("categorySlug", "in", slugVals.slice(0, 10)))
      )
        .then(addDocs)
        .catch(() => {})
    );
  }

  try {
    await Promise.all(tasks);
  } catch {}

  if (results.size) return Array.from(results.values());

  const allSnap = await FS.getDocs(colRef);
  const wanted = new Set(slugVals);
  const filtered = allSnap.docs.filter((d) => {
    const x = d.data() || {};
    const haystack = []
      .concat(x.collection)
      .concat(x.collections || [])
      .concat(x.collectionSlug)
      .concat(x.collectionSlugs || [])
      .concat(x.tags || [])
      .concat(x.category)
      .concat(x.categorySlug);

    const slugs = haystack.filter(Boolean).map(norm);
    return slugs.some((s) => wanted.has(s));
  });

  return filtered;
}

/* ----------------------------------- Page ----------------------------------- */

export default function Collections() {
  const { slug: rawSlug } = useParams();
  const urlSlug = norm(rawSlug);

  const metaKey = useMemo(() => {
    if (COLLECTION_META[urlSlug]) return urlSlug;
    return Object.keys(COLLECTION_META).find((k) => {
      const syns = COLLECTION_META[k].synonyms || [];
      return syns.map(norm).includes(urlSlug);
    });
  }, [urlSlug]);

  const meta = metaKey ? COLLECTION_META[metaKey] : null;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!meta) return;
      setLoading(true);
      try {
        const prodDocs = await fetchProductsByCollection(metaKey, meta);

        const mapped = await Promise.all(
          prodDocs.map(async (d) => {
            const data = d.data() || {};
            const images = Array.isArray(data.images) ? data.images : [];
            const img = images[0] ? await toDownloadUrl(images[0]) : "";
            const priceNum = Number(data.basePrice ?? data.price ?? 0);
            return {
              id: d.id,
              name: data.name || data.title || "Untitled",
              price: priceNum ? `₱${priceNum.toLocaleString()}` : "₱—",
              img:
                img ||
                "https://via.placeholder.com/800x600?text=Furnitune+Product",
            };
          })
        );

        if (!dead) setItems(mapped);
      } finally {
        if (!dead) setLoading(false);
      }
    })();

    return () => {
      dead = true;
    };
  }, [meta, metaKey]);

  if (!meta) return <Navigate to="/collections" replace />;

  /* Prepare up to two images for the hero. If only one exists, we'll show one. */
  const heroImages = (meta.banners && meta.banners.filter(Boolean)) || [];

  return (
    <div className="collection">
      <div
        style={{
          marginTop: 6,
          marginBottom: 8,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#2a6b5b",
        }}
      >
        Collections
      </div>

      <h1 className="collection-title">{meta.title}</h1>

      {/* ✅ Two-image (or single) hero */}
      {heroImages.length > 1 ? (
        <div className="collection-hero">
          {heroImages.slice(0, 2).map((src, i) => (
            <img key={i} src={src} alt={`${meta.title} ${i + 1}`} />
          ))}
        </div>
      ) : heroImages.length === 1 ? (
        <img
          src={heroImages[0]}
          alt={meta.title}
          className="collection-banners"
        />
      ) : null}

      <div
        style={{
          marginTop: 18,
          marginBottom: 6,
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#2a6b5b",
        }}
      >
        Description
      </div>

      <p className="collection-descriptions">
        {meta.description || "Discover curated pieces from this collection."}
      </p>

      <h2 className="section-heading">{meta.title} FURNITURES</h2>

      <div className="product-grids">
        {loading && <div className="muted">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="muted">No products in this collection yet.</div>
        )}
        {!loading &&
          items.map((p) => (
            <article key={p.id} className="product-cards">
              <Link to={`/product/${p.id}`} title={p.name}>
                <img src={p.img} alt={p.name} className="product-imgs" />
              </Link>
              <h3 className="product-titles">{p.name}</h3>
              <p className="product-prices">{p.price}</p>
            </article>
          ))}
      </div>
    </div>
  );
}
