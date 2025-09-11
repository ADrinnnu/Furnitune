// src/pages/Landing.jsx
import React, { useEffect, useState } from "react";
import Hero from "../components/Hero.jsx";
import FeatureStrip from "../components/FeatureStrip.jsx";
import CategoryChips from "../components/CategoryChips.jsx";
import CardCarousel from "../components/CardCarousel.jsx";
import HomepageSections from "../components/HomepageSections.jsx";

import comImg from "../assets/Com.png";
import sitImg from "../assets/sit.png";
import restImg from "../assets/rest.png";
import soctImg from "../assets/socsit.png";

import { firestore, storage } from "../firebase";
import * as FS from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";

const slug = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "-");

function normalizeCollections(d) {
  const out = new Set();
  const add = (v) => { const s = slug(v); if (s) out.add(s); };
  const addArr = (arr) => Array.isArray(arr) && arr.forEach(add);
  add(d.categorySlug);
  add(d.category);
  addArr(d.collections);
  addArr(d.collectionSlugs);
  addArr(d.tags);
  if (d.isBestSeller) out.add("best-sellers");
  if (d.isNew || d.isNewArrival) out.add("new-designs");
  return Array.from(out);
}

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

export default function Landing() {
  const [bestSellers, setBestSellers] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await FS.getDocs(FS.collection(firestore, "products"));

        let items = await Promise.all(
          snap.docs.map(async (doc) => {
            const data = doc.data() || {};
            const cols = normalizeCollections(data);
            if (!cols.includes("best-sellers")) return null;

            const images = Array.isArray(data.images) ? data.images : [];
            const firstUrl = images[0] ? await toDownloadUrl(images[0]) : "";

            const base = Number(data.basePrice || 0);
            const price = base ? `₱${base.toLocaleString()}` : "₱—";

            const id = doc.id;
            const detailPath = `/product/${id}`;

            return {
              id,
              to: detailPath,
              link: detailPath,
              href: detailPath,
              title: data.name || "Untitled",
              price,
              img: firstUrl || "https://via.placeholder.com/800x600?text=Furnitune",
            };
          })
        );

        items = items.filter(Boolean).slice(0, 12);
        setBestSellers(items);
      } catch (err) {
        console.error("[landing] best-sellers load failed:", err);
        setBestSellers([]);
      }
    })();
  }, []);

  // ✅ add `to` so each collection card routes to its page
  const collections = [
    {
      id: 1,
      title: "Comfort Core Collection",
      img: comImg,
      description:
        "Experience unmatched comfort with cozy sofas and recliners designed for everyday relaxation.",
      to: "/collections/comfort-core",
      link: "/collections/comfort-core",
      href: "/collections/comfort-core",
    },
    {
      id: 2,
      title: "Social Sitting Collection",
      img: soctImg,
      description:
        "Perfect for gatherings, this collection offers stylish seating that brings people together.",
      to: "/collections/social-sitting",
      link: "/collections/social-sitting",
      href: "/collections/social-sitting",
    },
    {
      id: 3,
      title: "Rest & Recharge",
      img: restImg,
      description:
        "Beds and loungers made for ultimate rest, giving you the energy to face each day refreshed.",
      to: "/collections/rest-recharge",
      link: "/collections/rest-recharge",
      href: "/collections/rest-recharge",
    },
    {
      id: 4,
      title: "Sit & Stay",
      img: sitImg,
      description:
        "Durable and versatile chairs and benches built for long-lasting comfort and style.",
      to: "/collections/sit-stay",
      link: "/collections/sit-stay",
      href: "/collections/sit-stay",
    },
  ];

  return (
    <>
      <section id="hero" className="container">
        <Hero />
        <FeatureStrip />
        <div className="section">
          <CategoryChips />
        </div>
      </section>

      <section id="best-sellers" className="container section">
        <h2>
          Our <span className="muteds">Best </span>Sellers!
        </h2>
        <CardCarousel items={bestSellers} type="product" />
      </section>

      <section id="collections" className="container section">
        <h2>
          Our <span className="muteds">Collections</span>!
        </h2>
        <CardCarousel items={collections} type="collection" />
      </section>

      <section id="homepage" className="container section">
        <HomepageSections items={collections} type="collection" />
      </section>
    </>
  );
}
