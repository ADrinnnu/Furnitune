import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

console.log("🔧 Seeder starting…");

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

/** Relative pricing rules per baseType (final = basePrice + delta, or basePrice * multiplier) */
const RULES_BY_TYPE = {
  Chairs: [
    { size: "Standard",  mode: "delta", value: 0 },
    { size: "Counter",   mode: "delta", value: 300 },
    { size: "Bar",       mode: "delta", value: 600 },
  ],
  Sofas: [
    { size: "2 Seater",  mode: "delta", value: 0 },
    { size: "3 Seater",  mode: "delta", value: 1500 },
    { size: "4 Seater",  mode: "delta", value: 3000 },
  ],
  Tables: [
    { size: "2 people",  mode: "delta", value: 0 },
    { size: "4 people",  mode: "delta", value: 800 },
    { size: "6 people",  mode: "delta", value: 1600 },
    { size: "8 people",  mode: "delta", value: 2400 },
  ],
  Beds: [
    { size: "Single",    mode: "delta", value: 0 },
    { size: "Double",    mode: "delta", value: 800 },
    { size: "Queen",     mode: "delta", value: 1600 },
    { size: "King",      mode: "delta", value: 2400 },
  ],
  Sectionals: [
    { size: "3 Seater",  mode: "delta", value: 0 },
    { size: "5 Seater",  mode: "delta", value: 4000 },
    { size: "7 Seater",  mode: "delta", value: 8000 },
  ],
  Ottomans: [
    { size: "Small",     mode: "delta", value: 0 },
    { size: "Medium",    mode: "delta", value: 300 },
    { size: "Large",     mode: "delta", value: 600 },
  ],
  Benches: [
    { size: "Small",     mode: "delta", value: 0 },
    { size: "Medium",    mode: "delta", value: 400 },
    { size: "Long",      mode: "delta", value: 800 },
  ],
};

async function main() {
  const prodSnap = await db.collection("products").get();
  const types = new Set();
  prodSnap.forEach((d) => {
    const bt = d.data()?.baseType;
    if (bt) types.add(String(bt));
  });
  console.log("Detected baseTypes:", [...types].join(", ") || "(none)");

  for (const type of types) {
    const rules = RULES_BY_TYPE[type];
    if (!rules) { console.log(`⚠️ No rules for "${type}", skipping.`); continue; }

    const existing = await db.collection("sizePriceRules").where("type", "==", type).get();
    if (!existing.empty) { console.log(`↩️ Rules already exist for "${type}", skipping.`); continue; }

    const batch = db.batch();
    rules.forEach((r) => {
      const ref = db.collection("sizePriceRules").doc();
      batch.set(ref, { type, size: r.size, mode: r.mode, value: r.value });
    });
    await batch.commit();
    console.log(`✅ Created ${rules.length} rules for "${type}".`);
  }

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
