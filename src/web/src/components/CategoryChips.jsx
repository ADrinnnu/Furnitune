import React from "react";

const chips = [
  'Beds','Sofas','Chairs','Tables','Benches',
  'Sectionals','Ottomans','Dressers','Outdoor'
];

export default function CategoryChips(){
  return (
    <div className="chipbar">
      {chips.map(c => <div key={c} className="chip">{c}</div>)}
    </div>
  );
}
