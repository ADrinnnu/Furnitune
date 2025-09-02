import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("../backend/recommender/serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

def fix_path(path: str) -> str:
    if not path:
        return path
    return path.replace("furnitune-64458.firebasestorage.app", "furnitune-64458.appspot.com")

def main():
    docs = db.collection("products").stream()
    fixed = 0
    for d in docs:
        data = d.to_dict()
        updated = {}

        if "images" in data and isinstance(data["images"], list):
            fixed_images = [fix_path(p) for p in data["images"]]
            if fixed_images != data["images"]:
                updated["images"] = fixed_images

        if "heroImage" in data and isinstance(data["heroImage"], str):
            fixed_hero = fix_path(data["heroImage"])
            if fixed_hero != data["heroImage"]:
                updated["heroImage"] = fixed_hero

        if updated:
            db.collection("products").document(d.id).update(updated)
            print(f"✅ Fixed {d.id}: {updated}")
            fixed += 1

    print(f"Done. Fixed {fixed} documents.")

if __name__ == "__main__":
    main()
