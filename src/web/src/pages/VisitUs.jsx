import React from "react";

const features = [
  {
    title: "CUSTOMIZE YOUR PIECE!",
    description:
      "Bring your vision to life with our customization feature—make your own piece in your own way.",
    button: "Click to start customizing your furniture",
    image: "/images/map.png",
    path: "" 
  },
  {
    title: "REPAIR YOUR FURNITURE!",
    description:
      "Give your furniture a second life—restore what matters, using our repair service.",
    button: "Send your furniture request.",
    image: "/images/customize.png",
    path: "" 
  },
  {
    title: "ASK FURNITURE SUGGESTION!",
    description:
      "Discover furniture that fits your style with our smart recommendation system.",
    button: "Take a short quiz to get a suggestion",
    image: "/images/recommendation.png",
    path: "" 
  }
];

export default function VisitUs() {
  return (
    <div className="homepage-container">
      {/* Store Info Section */}
      <section className="store-info">
        <div className="store-text">
          <h3>PHILIPPINES</h3>
          <h1>CONCEPCION, TARLAC</h1>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. LA Define
            Studio situum est in cor La Brea shopping district — collectionem
            aedificiorum annorum 1950 legalississime renovatum. Nostae elementa
            moderna et temporis operetta perfecte inter singularaes architecturae
            notatas et creativam atmosphaeram residunt.
          </p>

          <p className="contact">
            📍 Cristobal St., Brgy. San Jose, Concepcion, Tarlac, 2316, Philippines
          </p>
          <p>📞 +63 909 090 090</p>
          <p>🕒 Mon - Fri: 8:00 AM - 5:00 PM</p>
          <p>Sat: 8:00 AM - 5:00 PM</p>
          <p>Sun: 10:00 AM - 5:00 PM</p>
          <p>Closed: Christmas Day, New Year’s Day, Valentine’s Day.</p>

          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus
            interdum, elit sit amet commodo pretium, neque nisl placerat nulla,
            nec feugiat lorem eros eget purus. Duis ultricies fringilla metus
            vitae ante iaculis vel, convallis erat porttitor. Aliquam erat volutpat.
          </p>
        </div>

        <div className="store-map">
          <img
            src="/map-sample.jpg"
            alt="Store Location Map"
          />
        </div>
      </section>

      {/* Services Section */}
      <div className="homepage">
      <section className="features-section">
        <h2>
          EVERYTHING <span className="thin-text">YOU NEED IS AT</span>{" "}
          <span className="highlight">FURNITUNE!</span>
        </h2>
        <div className="cards-container">
          {features.map((f, index) => (
            <div key={index} className="feature-card">
              <div
                className="feature-image"
                style={{ backgroundImage: `url(${f.image})` }}
              ></div>
              <div className="feature-content">
                <h3>{f.title}</h3>
                <p>{f.description}</p>
                <button onClick={() => navigate(f.path)}>{f.button}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
    </div>
  );
}