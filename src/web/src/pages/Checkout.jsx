import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import { getCheckoutItems } from "../utils/checkoutSelection";
import { auth, firestore } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import "../Checkout.css";

const PENDING_KEY = "PENDING_CHECKOUT";

export default function Checkout() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const repairId = params.get("repairId"); // from Repair flow
  const customMode = params.get("custom") === "1"; // <-- NEW

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
        draft.image ||
        null;

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
            r.total ??
              ((r.typePrice || 0) +
                (r.coverMaterialPrice || 0) +
                (r.frameMaterialPrice || 0))
          ) || 0;
        const image = Array.isArray(r.images) && r.images[0] ? r.images[0] : null;

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

  // Form state
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

  // Totals (preview only; the real order will be created on Payment)
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

  const handleContinueToPay = async () => {
    if (!items || items.length === 0) {
      alert("Your order is empty.");
      return;
    }
    if (!email || !first || !last || !street || !city || !stateProv || !zip || !phone) {
      alert("Please complete all required fields.");
      return;
    }

    // Ensure we have a user (anon is fine) — but DO NOT create the order here.
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
      email,
      phone,
      line1: street,
      line2: apt || "",
      city,
      province: stateProv,
      zip,
      newsletterOptIn: !!news,
    };

    // Include customization draft if in custom mode
    let customData = null;
    if (customMode) {
      try {
        const raw = sessionStorage.getItem("custom_draft");
        customData = raw ? JSON.parse(raw) : null;
      } catch {}
    }

    // Save a pending payload the Payment page will use to CREATE the order.
    const payload = {
      items,
      subtotal,
      discount,
      shippingFee,
      total,
      shippingAddress,
      repairId: repairId || null,
      createdAtClient: Date.now(),
      // NEW for customization flow
      custom: !!customMode,
      customData, // the full draft we prepared earlier
    };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));

    // Go to Payment (no orderId yet!)
    const qsParts = [];
    if (repairId) qsParts.push(`repairId=${encodeURIComponent(repairId)}`);
    if (customMode) qsParts.push("custom=1");
    const qs = qsParts.length ? `?${qsParts.join("&")}` : "";
    navigate(`/Payment${qs}`);
  };

  return (
    <div className="checkout-container">
      {/* LEFT: Email + Shipping form */}
      <div className="checkout-form">
        <h3>EMAIL</h3>
        <input
          type="email"
          placeholder="*Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
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
          <input type="text" placeholder="*First Name" required value={first} onChange={(e) => setFirst(e.target.value)} />
          <input type="text" placeholder="*Last Name"  required value={last}  onChange={(e) => setLast(e.target.value)} />
        </div>

        <input type="text" placeholder="*Street Address" required value={street} onChange={(e) => setStreet(e.target.value)} />
        <input type="text" placeholder="Apt/Suite # (Optional)" value={apt} onChange={(e) => setApt(e.target.value)} />

        <div className="form-grid">
          <input type="text" placeholder="*City"   required value={city}     onChange={(e) => setCity(e.target.value)} />
          <input type="text" placeholder="*State"  required value={stateProv} onChange={(e) => setStateProv(e.target.value)} />
          <input type="text" placeholder="*Zip/Postal Code" required value={zip} onChange={(e) => setZip(e.target.value)} />
        </div>

        <input type="text" placeholder="*Phone Number" required value={phone} onChange={(e) => setPhone(e.target.value)} />

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
