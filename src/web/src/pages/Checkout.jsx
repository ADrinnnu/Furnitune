// src/pages/Checkout.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import { getCheckoutItems } from "../utils/checkoutSelection";
import { auth, firestore } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import "../Checkout.css";

const PENDING_KEY = "PENDING_CHECKOUT";

/* --- helpers --- */
const onlyDigits = (v = "") => v.replace(/\D+/g, "");
const trimStr = (v = "") => v.replace(/\s+/g, " ").trim();
const isValidEmail = (v = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isValidPHZip = (digits = "") => /^\d{4}$/.test(digits);
const isValidMobilePH = (digits = "") => /^\d{10,11}$/.test(digits);

// keep payload small: drop big props we don't need on /Payment
const slimItems = (items = []) =>
  items.map((it) => ({
    id: it.id,
    productId: it.productId,
    title: it.title || it.name || "Item",
    name: it.name || it.title || "Item",
    qty: Number(it.qty || 1),
    price: Number(it.price || 0),
    // keep a small preview URL if you want, but NOT data URLs / blobs
    image: typeof it.image === "string" && it.image.startsWith("http") ? it.image : null,
  }));

export default function Checkout() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const repairId = params.get("repairId");
  const customMode = params.get("custom") === "1";

  // Right-side list (cart/buy-now or single repair/custom item)
  const [items, setItems] = useState(getCheckoutItems());

  // If Customization flow, load draft as single line item
  useEffect(() => {
    if (!customMode) return;
    try {
      const raw = sessionStorage.getItem("custom_draft");
      const draft = raw ? JSON.parse(raw) : null;
      if (!draft) return;

      const title = draft.productTitle || "Customized Furniture";
      const price = Number(draft.unitPrice || 0);
      const image =
        (Array.isArray(draft.images) && draft.images[0]) ||
        (draft.imageUrls && draft.imageUrls[0]) ||
        (typeof draft.image === "string" && draft.image.startsWith("http") ? draft.image : null);

      setItems([
        {
          id: `custom-${Date.now()}`,
          productId: draft.productId || "custom",
          name: title,
          title,
          qty: 1,
          price,
          image,
          imageUrl: image,
          meta: { custom: true },
        },
      ]);
    } catch (e) {
      console.warn("No custom draft found:", e);
    }
  }, [customMode]);

  // If Repair flow, load that one repair as a line item for preview
  useEffect(() => {
    if (!repairId || customMode) return;
    (async () => {
      try {
        const snap = await getDoc(doc(firestore, "repairs", repairId));
        if (!snap.exists()) return;
        const r = snap.data();
        const title = `Repair — ${r.typeLabel || r.typeId || "Furniture"}`;
        const price =
          Number(
            r?.total ??
              ((r?.typePrice || 0) +
                (r?.coverMaterialPrice || 0) +
                (r?.frameMaterialPrice || 0))
          ) || 0;
        const image = Array.isArray(r?.images) && r.images[0] ? r.images[0] : null;

        setItems([
          {
            id: `repair-${repairId}`,
            productId: `repair-${repairId}`,
            name: title,
            title,
            qty: 1,
            price,
            image,
            imageUrl: image,
            meta: { repairId },
          },
        ]);
      } catch (e) {
        console.error("Failed to load repair for checkout:", e);
      }
    })();
  }, [repairId, customMode]);

  const [email, setEmail] = useState("");
  const [news, setNews] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [street, setStreet] = useState("");
  const [apt, setApt] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");

  const [errors, setErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const shippingFee = 510;
  const discount = 69;
  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty) || 1),
        0
      ),
    [items]
  );
  const total = subtotal - discount + shippingFee;

  /* ---- PURE computeErrors (no setState in render) ---- */
  const computeErrors = () => {
    const nextErrors = {};

    const emailTrim = trimStr(email);
    const firstTrim = trimStr(first);
    const lastTrim = trimStr(last);
    const streetTrim = trimStr(street);
    const cityTrim = trimStr(city);
    const stateTrim = trimStr(stateProv);
    const zipDigits = onlyDigits(zip);
    const phoneDigits = onlyDigits(phone);

    if (!emailTrim) nextErrors.email = "Email is required.";
    else if (!isValidEmail(emailTrim)) nextErrors.email = "Enter a valid email.";

    if (!firstTrim) nextErrors.first = "First name is required.";
    if (!lastTrim) nextErrors.last = "Last name is required.";
    if (!streetTrim) nextErrors.street = "Street address is required.";
    if (!cityTrim) nextErrors.city = "City is required.";
    if (!stateTrim) nextErrors.stateProv = "State/Province is required.";

    if (!zipDigits) nextErrors.zip = "ZIP is required.";
    else if (!isValidPHZip(zipDigits)) nextErrors.zip = "ZIP should be 4 digits.";

    if (!phoneDigits) nextErrors.phone = "Mobile number is required.";
    else if (!isValidMobilePH(phoneDigits)) nextErrors.phone = "Mobile should be 10–11 digits.";

    const missingLabels = Object.entries(nextErrors)
      .filter(([, msg]) => /required/i.test(String(msg)))
      .map(([k]) => ({
        email: "Email",
        first: "First Name",
        last: "Last Name",
        street: "Street Address",
        city: "City",
        stateProv: "State/Province",
        zip: "ZIP/Postal Code",
        phone: "Phone Number",
      }[k] || k));

    return { nextErrors, missingLabels, valid: Object.keys(nextErrors).length === 0 };
  };

  const scrollToFirstError = (errs) => {
    const keys = Object.keys(errs || {});
    if (!keys.length) return;
    const el = document.querySelector(`[name="${keys[0]}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  };

  const handleContinueToPay = async () => {
    setSubmitAttempted(true);

    if (!items || items.length === 0) {
      alert("Your order is empty.");
      return;
    }

    // requireds
    if (!email || !first || !last || !street || !city || !stateProv || !zip || !phone) {
      const { nextErrors } = computeErrors();
      setErrors(nextErrors);
      setTimeout(() => scrollToFirstError(nextErrors), 0);
      alert("Please complete all required fields.");
      return;
    }

    // formats
    const { nextErrors, valid } = computeErrors();
    setErrors(nextErrors);
    if (!valid) {
      setTimeout(() => scrollToFirstError(nextErrors), 0);
      alert("Please fix the highlighted fields.");
      return;
    }

    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch (e) {
      console.warn("Anonymous sign-in failed (continuing):", e);
    }

    const shippingAddress = {
      fullName: `${first} ${last}`.trim(),
      firstName: first,
      lastName: last,
      email: trimStr(email),
      phone: onlyDigits(phone),
      line1: street,
      line2: apt || "",
      city,
      province: stateProv,
      zip: onlyDigits(zip),
      newsletterOptIn: !!news,
    };

    // Build a SMALL pending payload:
    // - DO NOT include the customization draft here (it may contain image data URLs).
    //   Payment will read 'custom_draft' directly from sessionStorage.
    const pendingPayload = {
      items: slimItems(items),
      subtotal,
      discount,
      shippingFee,
      total,
      shippingAddress,
      repairId: repairId || null,
      createdAtClient: Date.now(),
      custom: !!customMode,
    };

    // Save with fallback if quota exceeded
    const payloadStr = JSON.stringify(pendingPayload);
    try {
      sessionStorage.setItem(PENDING_KEY, payloadStr);
    } catch (e1) {
      try {
        // last-resort: ultra-slim items
        const ultraSlim = {
          ...pendingPayload,
          items: pendingPayload.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            qty: i.qty,
            price: i.price,
            title: i.title,
          })),
        };
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(ultraSlim));
      } catch (e2) {
        // give up storing; Payment will still work for customization
        sessionStorage.removeItem(PENDING_KEY);
        alert(
          "Your selection is too large to save temporarily. We'll continue, but if you go back you may need to re-enter details."
        );
      }
    }

    // Go to Payment (no orderId yet)
    const qsParts = [];
    if (repairId) qsParts.push(`repairId=${encodeURIComponent(repairId)}`);
    if (customMode) qsParts.push("custom=1");
    const qs = qsParts.length ? `?${qsParts.join("&")}` : "";
    navigate(`/Payment${qs}`);
  };

  const renderBanner = () => {
    if (!submitAttempted) return null;
    const { valid, missingLabels } = computeErrors();
    if (valid) return null;

    const missingTxt =
      missingLabels.length > 0
        ? `Missing required: ${missingLabels.join(", ")}.`
        : "Please fix the highlighted fields.";

    return (
      <div
        className="form-banner warning"
        role="alert"
        aria-live="assertive"
        style={{
          background: "#fff4e5",
          border: "1px solid #ffc266",
          color: "#663c00",
          padding: "10px 12px",
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 14,
        }}
      >
        <strong>Check your details.</strong> {missingTxt}
      </div>
    );
  };

  return (
    <div className="checkout-container">
      {/* LEFT: Email + Shipping form */}
      <div className="checkout-form">
        {renderBanner()}

        <h3>EMAIL</h3>
        <div className={`field ${errors.email ? "has-error" : ""}`}>
          <input
            name="email"
            type="email"
            placeholder="*Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmail(trimStr(email))}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "err-email" : undefined}
          />
          {errors.email && <small id="err-email" className="error-text">{errors.email}</small>}
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={news}
            onChange={(e) => setNews(e.target.checked)}
          />{" "}
          Sign up for news &amp; special offers?
        </label>

        <h3>SHIPPING ADDRESS</h3>
        <div className="form-grid">
          <div className={`field ${errors.first ? "has-error" : ""}`}>
            <input
              name="first"
              type="text"
              placeholder="*First Name"
              required
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              onBlur={() => setFirst(trimStr(first))}
              aria-invalid={!!errors.first}
              aria-describedby={errors.first ? "err-first" : undefined}
            />
            {errors.first && <small id="err-first" className="error-text">{errors.first}</small>}
          </div>

          <div className={`field ${errors.last ? "has-error" : ""}`}>
            <input
              name="last"
              type="text"
              placeholder="*Last Name"
              required
              value={last}
              onChange={(e) => setLast(e.target.value)}
              onBlur={() => setLast(trimStr(last))}
              aria-invalid={!!errors.last}
              aria-describedby={errors.last ? "err-last" : undefined}
            />
            {errors.last && <small id="err-last" className="error-text">{errors.last}</small>}
          </div>
        </div>

        <div className={`field ${errors.street ? "has-error" : ""}`}>
          <input
            name="street"
            type="text"
            placeholder="*Street Address"
            required
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            onBlur={() => setStreet(trimStr(street))}
            aria-invalid={!!errors.street}
            aria-describedby={errors.street ? "err-street" : undefined}
          />
          {errors.street && <small id="err-street" className="error-text">{errors.street}</small>}
        </div>

        <input
          name="apt"
          type="text"
          placeholder="Apt/Suite # (Optional)"
          value={apt}
          onChange={(e) => setApt(e.target.value)}
          onBlur={() => setApt(trimStr(apt))}
        />

        <div className="form-grid">
          <div className={`field ${errors.city ? "has-error" : ""}`}>
            <input
              name="city"
              type="text"
              placeholder="*City"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onBlur={() => setCity(trimStr(city))}
              aria-invalid={!!errors.city}
              aria-describedby={errors.city ? "err-city" : undefined}
            />
            {errors.city && <small id="err-city" className="error-text">{errors.city}</small>}
          </div>

          <div className={`field ${errors.stateProv ? "has-error" : ""}`}>
            <input
              name="stateProv"
              type="text"
              placeholder="*State"
              required
              value={stateProv}
              onChange={(e) => setStateProv(e.target.value)}
              onBlur={() => setStateProv(trimStr(stateProv))}
              aria-invalid={!!errors.stateProv}
              aria-describedby={errors.stateProv ? "err-state" : undefined}
            />
            {errors.stateProv && <small id="err-state" className="error-text">{errors.stateProv}</small>}
          </div>

          <div className={`field ${errors.zip ? "has-error" : ""}`}>
            <input
              name="zip"
              type="text"
              placeholder="*Zip/Postal Code"
              required
              value={zip}
              onChange={(e) => setZip(onlyDigits(e.target.value).slice(0, 6))}
              onBlur={() => setZip(onlyDigits(zip))}
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              aria-invalid={!!errors.zip}
              aria-describedby={errors.zip ? "err-zip" : undefined}
            />
            {errors.zip && <small id="err-zip" className="error-text">{errors.zip}</small>}
          </div>
        </div>

        <div className={`field ${errors.phone ? "has-error" : ""}`}>
          <input
            name="phone"
            type="tel"
            placeholder="*Phone Number"
            required
            value={phone}
            onChange={(e) => setPhone(onlyDigits(e.target.value).slice(0, 11))}
            onBlur={() => setPhone(onlyDigits(phone))}
            inputMode="numeric"
            pattern="\d{10,11}"
            maxLength={11}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "err-phone" : undefined}
          />
          {errors.phone && <small id="err-phone" className="error-text">{errors.phone}</small>}
        </div>

        <div className="form-actions">
          <button className="cancel-btn" onClick={() => navigate(-1)}>CANCEL</button>
          <button className="pay-btn" onClick={handleContinueToPay}>CONTINUE TO PAY</button>
        </div>
      </div>

      {/* RIGHT: Order Summary */}
      <div className="checkout-summary">
        <OrderSummaryCard
          title="ORDER SUMMARY"
          showSupport
          showAddress={false}
          items={items}
          discount={69}
          shippingFee={510}
          order={{ items, subtotal, discount: 69, shippingFee: 510, total }}
        />
      </div>
    </div>
  );
}
