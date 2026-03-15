// src/pages/Checkout.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import { getCheckoutItems } from "../utils/checkoutSelection";
import { auth, firestore, storage } from "../firebase"; 
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage"; 
import "../Checkout.css";

import {
  regions,
  provinces,
  cities,
  barangays,
} from "select-philippines-address";

const PENDING_KEY = "PENDING_CHECKOUT";
const LOGIN_PATH = "/login";
const COUNTRY_DEFAULT = "Philippines";

/* --- helpers --- */
const onlyDigits = (v = "") => v.replace(/\D+/g, "");
const trimStr = (v = "") => v.replace(/\s+/g, " ").trim();
const isValidEmail = (v = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isValidPHZip = (digits = "") => /^\d{4}$/.test(digits);
const isValidMobilePH = (digits = "") => /^\d{10,11}$/.test(digits);

// 🔹 ROBUST URL RESOLVER (Fixed to stop breaking valid http images)
async function resolveStorageUrl(path) {
  if (!path || typeof path !== "string") return null;

  // If it's already a working web link or base64 image, skip Firebase resolution
  if (path.startsWith("http") || path.startsWith("data:")) return path;

  if (path.startsWith("gs://")) {
    try {
      let relativePath = path;
      const bucketEndIndex = path.indexOf("/", 5);
      if (bucketEndIndex !== -1) {
        relativePath = path.substring(bucketEndIndex + 1);
      }

      const storageRef = ref(storage, relativePath);
      return await getDownloadURL(storageRef);
    } catch (e) {
      console.error("Error resolving image URL:", path, e);
      return null; 
    }
  }
  return path;
}

const slimItems = (items = []) =>
  items.map((it) => ({
    id: it.id,
    productId: it.productId,
    title: it.title || it.name || "Item",
    name: it.name || it.title || "Item",
    qty: Number(it.qty || 1),
    price: Number(it.price || 0),
    image: it.image || it.imageUrl || null, 

    size: it.size || it.selectedSize || null,
    selectedSize: it.selectedSize ?? it.size ?? null,

    color: it.color || it.selectedColor || it.colorName || null,
    selectedColor: it.selectedColor ?? it.color ?? it.colorName ?? null,
    colorName: it.colorName ?? it.selectedColor ?? null,
    colorHex: it.colorHex ?? null,

    material: it.material || null,
    selectedMaterial: it.selectedMaterial ?? null,
    additionals: Array.isArray(it.additionals) ? it.additionals : [],

    // 👇 PRESERVE NEW CUSTOM MATERIALS
    materials: it.materials || {},
    uniqueSpecs: it.uniqueSpecs || {},
    customDimensions: it.customDimensions || {},
    notes: it.notes || it.note || "", 
  }));

export default function Checkout() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const repairId = params.get("repairId");
  const customMode = params.get("custom") === "1";

  // Start empty if custom mode to prevent flashing cart items
  const [items, setItems] = useState(customMode ? [] : getCheckoutItems());

  // ---------------------------------------------
  // RESOLVE IMAGES FOR STANDARD CART ITEMS
  // ---------------------------------------------
  useEffect(() => {
    if (customMode || repairId) return; 
    
    const resolveImages = async () => {
      let hasChanges = false;
      const resolvedItems = await Promise.all(
        items.map(async (item) => {
          const raw = item.image || item.imageUrl;
          if (raw && (raw.startsWith("gs://") || !raw.startsWith("http"))) {
            const url = await resolveStorageUrl(raw);
            if (url && url !== raw) {
              hasChanges = true;
              return { ...item, image: url, imageUrl: url };
            }
          }
          return item;
        })
      );
      if (hasChanges) setItems(resolvedItems);
    };

    if (items.length > 0) resolveImages();
  }, [items.length, customMode, repairId]); 

  // ---------------------------------------------
  // LOAD THE SPECS FROM STORAGE FOR CUSTOM ORDER
  // ---------------------------------------------
  useEffect(() => {
    if (!customMode) return;
    
    const loadCustomDraft = async () => {
      try {
        const raw = sessionStorage.getItem("custom_draft");
        if (!raw) return;

        const draft = JSON.parse(raw);

        const title = draft.productTitle || "Customized Furniture";
        const price = Number(draft.unitPrice || 0);
        
        const rawImage = 
          (Array.isArray(draft.images) && draft.images[0]) ||
          (draft.imageUrls && draft.imageUrls[0]) ||
          (typeof draft.image === "string" ? draft.image : null) ||
          draft.image; // Fallback to raw property

        const resolvedImage = await resolveStorageUrl(rawImage) || rawImage;

        setItems([
          {
            id: `custom-${Date.now()}`,
            productId: draft.productId || "custom",
            name: title,
            title,
            qty: 1,
            price,
            image: resolvedImage, 
            imageUrl: resolvedImage,
            
            size: draft.size || null,
            selectedSize: draft.size || null,
            
            color: draft?.materials?.["Cover Color"] || null,
            material: draft?.materials?.["Leather / Fabric Type"] || null,
            
            additionals: Array.isArray(draft.additionals) ? draft.additionals : [],
            
            materials: draft.materials || {},
            uniqueSpecs: draft.uniqueSpecs || {},
            customDimensions: draft.customDimensions || {},
            notes: draft.notes || "",

            meta: { custom: true },
          },
        ]);
      } catch (e) {
        console.error("Error loading custom draft:", e);
      }
    };
    loadCustomDraft();
  }, [customMode]);

  // ---------------------------------------------
  // RESOLVE IMAGES FOR REPAIR ORDERS
  // ---------------------------------------------
  useEffect(() => {
    if (!repairId || customMode) return;
    (async () => {
      try {
        const snap = await getDoc(doc(firestore, "repairs", repairId));
        if (!snap.exists()) return;
        const r = snap.data();
        const title = `Repair — ${r.typeLabel || r.typeId || "Furniture"}`;
        const price = Number(r?.total ?? (r?.typePrice || 0) + (r?.coverMaterialPrice || 0) + (r?.frameMaterialPrice || 0)) || 0;
        
        const rawImage = Array.isArray(r?.images) && r.images[0] ? r.images[0] : null;
        const resolvedImage = await resolveStorageUrl(rawImage) || rawImage;

        setItems([
          {
            id: `repair-${repairId}`,
            productId: `repair-${repairId}`,
            name: title,
            title,
            qty: 1,
            price,
            image: resolvedImage,
            imageUrl: resolvedImage,
            meta: { repairId },
          },
        ]);
      } catch (e) {
        console.error("Failed to load repair for checkout:", e);
      }
    })();
  }, [repairId, customMode]);

  /* --- FORM STATE --- */
  const [email, setEmail] = useState("");
  const [news, setNews] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [street, setStreet] = useState("");
  const [apt, setApt] = useState(""); 
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("");

  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");        
  const [stateProv, setStateProv] = useState(""); 
  const [barangay, setBarangay] = useState("");   

  const [addrLists, setAddrLists] = useState({ region: [], province: [], city: [], barangay: [] });
  const [addrCodes, setAddrCodes] = useState({ region: "", province: "", city: "", barangay: "" });

  useEffect(() => {
    regions().then((res) => {
      setAddrLists((prev) => ({ ...prev, region: res }));
    });
  }, []);

  /* --- HANDLERS --- */
  const handleRegionChange = (e) => {
    const code = e.target.value;
    const name = e.target.options[e.target.selectedIndex].text;
    setRegion(name);
    setAddrCodes((prev) => ({ ...prev, region: code, province: "", city: "", barangay: "" }));
    setAddrLists((prev) => ({ ...prev, province: [], city: [], barangay: [] }));
    setStateProv(""); setCity(""); setBarangay("");
    if (code) provinces(code).then((res) => setAddrLists((prev) => ({ ...prev, province: res })));
  };

  const handleProvinceChange = (e) => {
    const code = e.target.value;
    const name = e.target.options[e.target.selectedIndex].text;
    setStateProv(name);
    setAddrCodes((prev) => ({ ...prev, province: code, city: "", barangay: "" }));
    setAddrLists((prev) => ({ ...prev, city: [], barangay: [] }));
    setCity(""); setBarangay("");
    if (code) cities(code).then((res) => setAddrLists((prev) => ({ ...prev, city: res })));
  };

  const handleCityChange = (e) => {
    const code = e.target.value;
    const name = e.target.options[e.target.selectedIndex].text;
    setCity(name);
    setAddrCodes((prev) => ({ ...prev, city: code, barangay: "" }));
    setAddrLists((prev) => ({ ...prev, barangay: [] }));
    setBarangay("");
    if (code) barangays(code).then((res) => setAddrLists((prev) => ({ ...prev, barangay: res })));
  };

  const handleBarangayChange = (e) => {
    const code = e.target.value;
    const name = e.target.options[e.target.selectedIndex].text;
    setBarangay(name);
    setAddrCodes((prev) => ({ ...prev, barangay: code }));
  };

  /* --- VALIDATION & SUBMIT --- */
  const [errors, setErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const shippingFee = 510;
  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1), 0),
    [items]
  );
  const total = subtotal + shippingFee;

  const computeErrors = () => {
    const nextErrors = {};
    const emailTrim = trimStr(email);
    const firstTrim = trimStr(first);
    const lastTrim = trimStr(last);
    const streetTrim = trimStr(street);
    const cityTrim = trimStr(city);
    const stateTrim = trimStr(stateProv);
    const brgyTrim = trimStr(barangay);
    const zipDigits = onlyDigits(zip);
    const phoneDigits = onlyDigits(phone);

    if (!emailTrim) nextErrors.email = "Email is required.";
    else if (!isValidEmail(emailTrim)) nextErrors.email = "Enter a valid email.";
    if (!firstTrim) nextErrors.first = "First name is required.";
    if (!lastTrim) nextErrors.last = "Last name is required.";
    if (!streetTrim) nextErrors.street = "Street address is required.";
    if (!stateTrim || stateTrim === "Select Province") nextErrors.stateProv = "Province is required.";
    if (!cityTrim || cityTrim === "Select City") nextErrors.city = "City is required.";
    if (!brgyTrim || brgyTrim === "Select Barangay") nextErrors.barangay = "Barangay is required.";
    if (!zipDigits) nextErrors.zip = "ZIP is required.";
    else if (!isValidPHZip(zipDigits)) nextErrors.zip = "ZIP should be 4 digits.";
    if (!phoneDigits) nextErrors.phone = "Mobile number is required.";
    else if (!isValidMobilePH(phoneDigits)) nextErrors.phone = "Mobile should be 10–11 digits.";

    const missingLabels = Object.entries(nextErrors)
      .filter(([, msg]) => /required/i.test(String(msg)))
      .map(([k]) => ({
        email: "Email", first: "First Name", last: "Last Name", street: "Street Address",
        city: "City", stateProv: "Province", barangay: "Barangay", zip: "ZIP/Postal Code", phone: "Phone Number",
      }[k] || k));

    return { nextErrors, missingLabels, valid: Object.keys(nextErrors).length === 0 };
  };

  const scrollToFirstError = (errs) => {
    const keys = Object.keys(errs || {});
    if (!keys.length) return;
    const el = document.querySelector(`[name="${keys[0]}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
  };

  const handleContinueToPay = async () => {
    setSubmitAttempted(true);
    if (!items || items.length === 0) { alert("Your order is empty."); return; }
    if (!email || !first || !last || !street || !city || !stateProv || !barangay || !zip || !phone) {
      const { nextErrors } = computeErrors();
      setErrors(nextErrors);
      setTimeout(() => scrollToFirstError(nextErrors), 0);
      alert("Please complete all required fields.");
      return;
    }
    const { nextErrors, valid } = computeErrors();
    setErrors(nextErrors);
    if (!valid) {
      setTimeout(() => scrollToFirstError(nextErrors), 0);
      alert("Please fix the highlighted fields.");
      return;
    }

    const line2Combined = [barangay, apt].filter(Boolean).join(", ");
    const shippingAddress = {
      fullName: `${first} ${last}`.trim(),
      firstName: first,
      lastName: last,
      email: trimStr(email),
      phone: onlyDigits(phone),
      line1: street,
      line2: line2Combined,
      city,
      province: stateProv,
      zip: onlyDigits(zip),
      country: COUNTRY_DEFAULT,
      newsletterOptIn: !!news,
    };

    const pendingPayload = {
      items: slimItems(items), 
      subtotal,
      shippingFee,
      total,
      shippingAddress,
      contactEmail: shippingAddress.email,
      contactPhone: shippingAddress.phone,
      nameFull: shippingAddress.fullName,
      userId: auth.currentUser?.uid || null,
      customer: {
        name: shippingAddress.fullName,
        email: shippingAddress.email,
        phone: shippingAddress.phone,
        address: { ...shippingAddress },
        uid: auth.currentUser?.uid || null,
      },
      repairId: repairId || null,
      createdAtClient: Date.now(),
      custom: !!customMode,
    };

    const payloadStr = JSON.stringify(pendingPayload);
    try { sessionStorage.setItem(PENDING_KEY, payloadStr); } 
    catch (e1) {
      try {
        const ultraSlim = { ...pendingPayload, items: pendingPayload.items.map((i) => ({ id: i.id, productId: i.productId, qty: i.qty, price: i.price, title: i.title })) };
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(ultraSlim));
      } catch (e2) {
        sessionStorage.removeItem(PENDING_KEY);
        alert("Your selection is too large to save temporarily. We'll continue, but if you go back you may need to re-enter details.");
      }
    }

    const qsParts = [];
    if (repairId) qsParts.push(`repairId=${encodeURIComponent(repairId)}`);
    if (customMode) qsParts.push("custom=1");
    const qs = qsParts.length ? `?${qsParts.join("&")}` : "";
    const paymentUrl = `/Payment${qs}`;

    if (!auth.currentUser) {
      const next = encodeURIComponent(paymentUrl);
      navigate(`${LOGIN_PATH}?next=${next}&checkout=1`);
      return;
    }
    navigate(paymentUrl);
  };

  const renderBanner = () => {
    if (!submitAttempted) return null;
    const { valid, missingLabels } = computeErrors();
    if (valid) return null;
    const missingTxt = missingLabels.length > 0 ? `Missing required: ${missingLabels.join(", ")}.` : "Please fix the highlighted fields.";
    return (
      <div className="form-banner warning" role="alert" style={{ background: "#fff4e5", border: "1px solid #ffc266", color: "#663c00", padding: "10px 12px", borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
        <strong>Check your details.</strong> {missingTxt}
      </div>
    );
  };

  return (
    <div className="checkout-container">
      <div className="checkout-form">
        {renderBanner()}
        <h3>EMAIL</h3>
        <div className={`field ${errors.email ? "has-error" : ""}`}>
          <input name="email" type="email" placeholder="*Email" required value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setEmail(trimStr(email))} />
          {errors.email && <small className="error-text">{errors.email}</small>}
        </div>
        <label className="checkbox"><input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} /> Sign up for news &amp; special offers?</label>

        <h3>SHIPPING ADDRESS</h3>
        <div className="form-grid">
          <div className={`field ${errors.first ? "has-error" : ""}`}>
            <input name="first" type="text" placeholder="*First Name" required value={first} onChange={(e) => setFirst(e.target.value)} onBlur={() => setFirst(trimStr(first))} />
            {errors.first && <small className="error-text">{errors.first}</small>}
          </div>
          <div className={`field ${errors.last ? "has-error" : ""}`}>
            <input name="last" type="text" placeholder="*Last Name" required value={last} onChange={(e) => setLast(e.target.value)} onBlur={() => setLast(trimStr(last))} />
            {errors.last && <small className="error-text">{errors.last}</small>}
          </div>
        </div>

        <div className="field">
          <select value={addrCodes.region} onChange={handleRegionChange} style={{width: '100%', padding: '10px'}}>
            <option value="">Select Region *</option>
            {addrLists.region.map((reg) => (<option key={reg.region_code} value={reg.region_code}>{reg.region_name}</option>))}
          </select>
        </div>

        <div className="form-grid">
          <div className={`field ${errors.stateProv ? "has-error" : ""}`}>
            <select name="stateProv" value={addrCodes.province} onChange={handleProvinceChange} disabled={!addrCodes.region} style={{width: '100%', padding: '10px'}}>
              <option value="">Select Province *</option>
              {addrLists.province.map((prov) => (<option key={prov.province_code} value={prov.province_code}>{prov.province_name}</option>))}
            </select>
            {errors.stateProv && <small className="error-text">{errors.stateProv}</small>}
          </div>
          <div className={`field ${errors.city ? "has-error" : ""}`}>
            <select name="city" value={addrCodes.city} onChange={handleCityChange} disabled={!addrCodes.province} style={{width: '100%', padding: '10px'}}>
              <option value="">Select City *</option>
              {addrLists.city.map((c) => (<option key={c.city_code} value={c.city_code}>{c.city_name}</option>))}
            </select>
            {errors.city && <small className="error-text">{errors.city}</small>}
          </div>
        </div>

        <div className="form-grid">
          <div className={`field ${errors.barangay ? "has-error" : ""}`}>
            <select name="barangay" value={addrCodes.barangay} onChange={handleBarangayChange} disabled={!addrCodes.city} style={{width: '100%', padding: '10px'}}>
              <option value="">Select Barangay *</option>
              {addrLists.barangay.map((b) => (<option key={b.brgy_code} value={b.brgy_code}>{b.brgy_name}</option>))}
            </select>
            {errors.barangay && <small className="error-text">{errors.barangay}</small>}
          </div>
          <div className={`field ${errors.zip ? "has-error" : ""}`}>
            <input name="zip" type="text" placeholder="*Zip/Postal Code" required value={zip} onChange={(e) => setZip(onlyDigits(e.target.value).slice(0, 6))} onBlur={() => setZip(onlyDigits(zip))} maxLength={6} />
            {errors.zip && <small className="error-text">{errors.zip}</small>}
          </div>
        </div>

        <div className={`field ${errors.street ? "has-error" : ""}`}>
          <input name="street" type="text" placeholder="*Street Address" required value={street} onChange={(e) => setStreet(e.target.value)} onBlur={() => setStreet(trimStr(street))} />
          {errors.street && <small className="error-text">{errors.street}</small>}
        </div>
        <input name="apt" type="text" placeholder="Unit, Floor, House No. (Optional)" value={apt} onChange={(e) => setApt(e.target.value)} onBlur={() => setApt(trimStr(apt))} />
        <div className={`field ${errors.phone ? "has-error" : ""}`}>
          <input name="phone" type="tel" placeholder="*Phone Number" required value={phone} onChange={(e) => setPhone(onlyDigits(e.target.value).slice(0, 11))} onBlur={() => setPhone(onlyDigits(phone))} maxLength={11} />
          {errors.phone && <small className="error-text">{errors.phone}</small>}
        </div>

        <div className="form-actions">
          <button className="cancel-btn" onClick={() => navigate(-1)}>CANCEL</button>
          <button className="pay-btn" onClick={handleContinueToPay}>CONTINUE TO PAY</button>
        </div>
      </div>

      <div className="checkout-summary">
        <OrderSummaryCard title="ORDER SUMMARY" showSupport showAddress={false} items={items} shippingFee={510} order={{ items, subtotal, shippingFee: 510, total }} />
      </div>
    </div>
  );
}