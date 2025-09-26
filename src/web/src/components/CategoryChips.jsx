import React from "react";
import { Link } from "react-router-dom";
import SectionalImg from "../assets/sec.png"
import BedImg from "../assets/bed.png"
import SofaImg from "../assets/sofa.png"
import ChairImg from "../assets/chairs.png"
import TableImg from "../assets/table.png"
import OttoImg from "../assets/otto.png"
import benchImg from "../assets/bench.png"


const chips = [
  { label: 'Beds', image: BedImg  },
  { label: 'Sofas', image: SofaImg },
  { label: 'Chairs', image: ChairImg },
  { label: 'Tables', image: TableImg },
  {label: 'Benches', image: benchImg },
  { label: 'Sectionals', image: SectionalImg },
 { label: 'Ottomans', image: OttoImg },

];

export default function CategoryChips() {
  return (
    <div className="chipbar">
      {chips.map(({ label, image }) => (
        <Link
          key={label}
          to={`/all?category=${encodeURIComponent(label)}`} 
          className="chip-wrapper"
        >
          <div className="chip-image-box">
            <img src={image} alt={label} className="chip-image" />
          </div>
          <span className="chip-label">{label}</span>
        </Link>
      ))}
    </div>
  );
}
