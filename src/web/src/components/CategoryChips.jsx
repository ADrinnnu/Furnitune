import React from "react";

const chips = [
  { label: 'Beds', image: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800' },
  { label: 'Sofas', image: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=800' },
  { label: 'Chairs', image: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800' },
  { label: 'Tables', image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800' },
  {label: 'Benches', image: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800' },
  { label: 'Sectionals', image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800' },
 { label: 'Ottomans', image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800' },
 { label: 'Desks', image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800' },
];

export default function CategoryChips() {
  return (
    <div className="chipbar">
      {chips.map(({ label, image }) => (
        <div key={label} className="chip-wrapper">
          <div className="chip-image-box">
            <img src={image} alt={label} className="chip-image" />
          </div>
          <span className="chip-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
