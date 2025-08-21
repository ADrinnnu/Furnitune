export const PRODUCTS = [
  { id: "1", title: "Sofa",         type: "Sofas",      price: 199.99, rating: 5, reviews: 82, thumb: "", images: [] },
  { id: "2", title: "Club",         type: "Chairs",     price: 159.99, rating: 4, reviews: 61, thumb: "", images: [] },
  { id: "3", title: "Chaise",       type: "Sofas",      price: 299.99, rating: 4, reviews: 33, thumb: "", images: [] },
  { id: "4", title: "Armchair",     type: "Chairs",     price: 129.99, rating: 5, reviews: 47, thumb: "", images: [] },
  { id: "5", title: "Accent Chair", type: "Chairs",     price: 179.99, rating: 4, reviews: 18, thumb: "", images: [] },
  { id: "6", title: "Table",        type: "Tables",     price: 89.99,  rating: 4, reviews: 25, thumb: "", images: [] },
  { id: "7", title: "Bench",        type: "Benches",    price: 149.99, rating: 4, reviews: 12, thumb: "", images: [] },
  { id: "8", title: "Bed",          type: "Beds",       price: 399.99, rating: 5, reviews: 31, thumb: "", images: [] },
  { id: "9", title: "Loveseat",     type: "Sofas",      price: 219.99, rating: 4, reviews: 44, thumb: "", images: [] },
];

export const listProducts = async () => {
  return PRODUCTS; // later replace with Firestore fetch
};

export const getProduct = (id) => PRODUCTS.find((p) => p.id === id);
