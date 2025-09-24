import React from "react";
import "../TermsOfService.css";

export default function TermsOfService({
  brand = "Furnitune",
  site = "furnitune.com",
  effective = "September 24, 2025",
  contact = {
    email: "support@furnitune.com",
    phone: "+63 909 090 090",
    address: "Cristobal St., Brgy. San Jose, Concepcion, Tarlac 2316, PH",
  },
}) {
  const sections = [
    { id: "eligibility", label: "1. Eligibility" },
    { id: "accounts", label: "2. Accounts" },
    { id: "orders", label: "3. Products & Orders" },
    { id: "payments", label: "4. Payments" },
    { id: "shipping", label: "5. Shipping & Delivery" },
    { id: "returns", label: "6. Returns & Refunds" },
    { id: "use", label: "7. Acceptable Use" },
    { id: "ip", label: "8. Intellectual Property" },
    { id: "warranty", label: "9. Disclaimers" },
    { id: "liability", label: "10. Limitation of Liability" },
    { id: "indemnity", label: "11. Indemnification" },
    { id: "law", label: "12. Governing Law" },
    { id: "changes", label: "13. Changes to These Terms" },
    { id: "contact", label: "14. Contact Us" },
  ];

  return (
    <main className="ftos ftos-wrap" role="main">
      {/* Hero */}
      <header className="ftos-hero">
        <div className="ftos-hero-inner">
          <p className="ftos-eyebrow">LEGAL</p>
          <h1 className="ftos-title">Terms of Service</h1>
          <p className="ftos-muted">Effective Date: {effective}</p>
        </div>
      </header>

      {/* Content grid */}
      <section className="ftos-grid">
        {/* Sidebar */}
        <nav className="ftos-toc" aria-label="Table of contents">
          <div className="ftos-toc-card">
            <h3>On this page</h3>
            <ul>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="ftos-meta-card">
            <h4>{brand}</h4>
            <p className="ftos-muted-sm">{site}</p>
          </div>
        </nav>

        {/* Body */}
        <article className="ftos-body">
          <section className="ftos-card">
            <p>
              Welcome to <strong>{brand}</strong>.   
               These Terms of Service govern your access to and use of
              our website, <strong>{site}</strong>, and related services
              (collectively, the “Services”). By accessing or using the Services,
              you agree to these Terms. If you do not agree, do not use the
              Services.
            </p>
          </section>

          <div className="ftos-soft-divider" />

          <section id="eligibility" className="ftos-card">
            <h2>1. Eligibility</h2>
            <ul>
              <li>You must be at least 18 years old (or the age of majority in your jurisdiction).</li>
              <li>You represent that any information you provide is accurate and complete.</li>
            </ul>
          </section>

          <section id="accounts" className="ftos-card">
            <h2>2. Accounts</h2>
            <ul>
              <li>You may need an account to place orders or access certain features.</li>
              <li>You are responsible for safeguarding your credentials and all activity under your account.</li>
              <li>Notify us immediately of any unauthorized use or security breach.</li>
            </ul>
          </section>

          <section id="orders" className="ftos-card">
            <h2>3. Products & Orders</h2>
            <ul>
              <li>All products and prices are subject to availability and change without notice.</li>
              <li>We may limit quantities, refuse or cancel orders at our sole discretion.</li>
              <li>Displayed colors and finishes may vary due to screens or materials.</li>
            </ul>
          </section>

          <section id="payments" className="ftos-card">
            <h2>4. Payments</h2>
            <ul>
              <li>We accept the payment methods shown at checkout.</li>
              <li>By submitting a payment, you warrant you are authorized to use that method.</li>
              <li>All charges are in the currency shown at checkout and must be paid in full.</li>
            </ul>
          </section>

          <section id="shipping" className="ftos-card">
            <h2>5. Shipping & Delivery</h2>
            <ul>
              <li>Delivery windows are estimates and may be affected by carrier delays or events beyond our control.</li>
              <li>Risk of loss passes to you upon delivery to the carrier unless required otherwise by law.</li>
              <li>White-glove or assembly services, if offered, may incur additional fees.</li>
            </ul>
          </section>

          <section id="returns" className="ftos-card">
            <h2>6. Returns & Refunds</h2>
            <ul>
              <li>Return requests must be initiated within the period stated on the product or checkout page.</li>
              <li>Items must be unused, undamaged, and in original packaging.</li>
              <li>Custom, made-to-order, or clearance items may be final sale.</li>
              <li>Refunds are issued to the original payment method unless otherwise required by law.</li>
            </ul>
          </section>

          <section id="use" className="ftos-card">
            <h2>7. Acceptable Use</h2>
            <ul>
              <li>Do not use the Services unlawfully, infringe rights, or interfere with operation.</li>
              <li>Do not attempt to access non-public areas, test vulnerabilities, or transmit malware.</li>
              <li>Do not misuse reviews, ratings, or messaging (e.g., spam, defamation, harassment).</li>
            </ul>
          </section>

          <section id="ip" className="ftos-card">
            <h2>8. Intellectual Property</h2>
            <p>
              All content on the Services—including text, images, designs, logos,
              and software—is owned by or licensed to {brand} and protected by
              applicable laws. You may not copy, modify, distribute, or create
              derivative works without our prior written consent.
            </p>
          </section>

          <section id="warranty" className="ftos-card">
            <h2>9. Disclaimers</h2>
            <p className="ftos-muted">
              Except as expressly stated, the Services and all content are provided
              “as is” and “as available” without warranties of any kind, whether
              express or implied, including merchantability, fitness for a
              particular purpose, and non-infringement.
            </p>
          </section>

          <section id="liability" className="ftos-card">
            <h2>10. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, {brand} and its affiliates will
              not be liable for any indirect, incidental, special, consequential, or
              punitive damages. Our aggregate liability for claims relating to the
              Services shall not exceed the amount you paid for the product giving
              rise to the claim.
            </p>
          </section>

          <section id="indemnity" className="ftos-card">
            <h2>11. Indemnification</h2>
            <p>
              You agree to defend, indemnify, and hold harmless {brand}, its
              affiliates, and personnel from any claims, damages, losses, or
              expenses arising from your use of the Services or violation of these Terms.
            </p>
          </section>

          <section id="law" className="ftos-card">
            <h2>12. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the jurisdiction where {brand} is
              established, without regard to conflict-of-law principles. Venue for
              disputes will be in the courts of that jurisdiction.
            </p>
          </section>

          <section id="changes" className="ftos-card">
            <h2>13. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be
              posted on this page with a new effective date. Your continued use of
              the Services after changes means you accept the updated Terms.
            </p>
          </section>

          <section id="contact" className="ftos-card">
            <h2>14. Contact Us</h2>
            <ul className="ftos-contact-list">
              <li>📧 <a href={`mailto:${contact.email}`}>{contact.email}</a></li>
              <li>📞 <a href={`tel:${contact.phone.replace(/\s+/g, "")}`}>{contact.phone}</a></li>
              <li>📍 {contact.address}</li>
            </ul>
          </section>
        </article>
      </section>
    </main>
  );
}
