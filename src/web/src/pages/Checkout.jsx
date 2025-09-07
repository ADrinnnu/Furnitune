// src/Checkout.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import { getCheckoutItems, clearCheckoutItems } from "../utils/checkoutSelection";
import { auth, firestore } from "../firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function Checkout() {
  const navigate = useNavigate();
  const items = getCheckoutItems(); // items selected from Buy Now / Cart

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

  // Totals to mirror your screenshot
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

  // Create order then go to payment
  const handleContinueToPay = async () => {
    if (!items || items.length === 0) {
      alert("Your order is empty.");
      return;
    }
    if (!email || !first || !last || !street || !city || !stateProv || !zip) {
      alert("Please complete all required fields.");
      return;
    }

    try {
      // Ensure there’s a user (anonymous if needed)
      const user =
        auth.currentUser || (await signInAnonymously(auth)).user;

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

      // 1) Create the order
      const orderData = {
        userId: user.uid,
        createdAt: serverTimestamp(),
        status: "processing",
        items,
        subtotal,
        discount,
        shippingFee,
        total,
        shippingAddress,
        contactEmail: email,
        note: "Created from Checkout",
      };
      const ref = await addDoc(collection(firestore, "orders"), orderData);

      // 2) Create a notification so the user can jump to Order Summary
      const firstItem = items[0] || null;
      await addDoc(collection(firestore, "users", user.uid, "notifications"), {
        type: "order_placed",
        orderId: ref.id,
        title: "Thanks for your order!",
        body: `We’re processing your order ${String(ref.id).slice(0, 6)}.`,
        image: firstItem?.image || firstItem?.img || null,
        link: `/ordersummary?orderId=${ref.id}`,
        createdAt: serverTimestamp(),
        read: false,
      });

      clearCheckoutItems();
      navigate(`/Payment?orderId=${ref.id}`);
    } catch (e) {
      console.error(e);
      alert("Could not create order. Please try again.");
    }
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
          <input
            type="text"
            placeholder="*First Name"
            required
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
          <input
            type="text"
            placeholder="*Last Name"
            required
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
        </div>

        <input
          type="text"
          placeholder="*Street Address"
          required
          value={street}
          onChange={(e) => setStreet(e.target.value)}
        />
        <input
          type="text"
          placeholder="Apt/Suite # (Optional)"
          value={apt}
          onChange={(e) => setApt(e.target.value)}
        />

        <div className="form-grid">
          <input
            type="text"
            placeholder="*City"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <input
            type="text"
            placeholder="*State"
            required
            value={stateProv}
            onChange={(e) => setStateProv(e.target.value)}
          />
          <input
            type="text"
            placeholder="*Zip/Postal Code"
            required
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
        </div>

        <input
          type="text"
          placeholder="*Phone Number"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <div className="form-actions">
          <button className="cancel-btn" onClick={() => navigate(-1)}>
            CANCEL
          </button>
          <button className="pay-btn" onClick={handleContinueToPay}>
            CONTINUE TO PAY
          </button>
        </div>
      </div>

      {/* RIGHT: Order Summary (matches screenshot) */}
      <div className="checkout-summary">
        <OrderSummaryCard
          title="ORDER SUMMARY"
          showSupport
          showAddress={false}
          // If your component expects raw values:
          items={items}
          discount={discount}
          shippingFee={shippingFee}
          // If it expects a single order object, it can read from this too:
          order={{ items, subtotal, discount, shippingFee, total }}
        />
      </div>
    </div>
  );
}
