// src/utils/reviewsAggregateClient.js
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Create a review and update product aggregate(s) atomically.
 * You may pass { productId } OR { productIds: [...] }.
 * Optional: orderId, items (stored on the review).
 *
 * Returns the created reviewId.
 */
export async function addReviewWithAggregate(
  db,
  {
    productId,
    productIds,            // array of product ids (preferred)
    userId,
    userName,
    rating,
    message = "",
    imageUrl = null,
    orderId = null,
    items = [],
  }
) {
  // Normalize product IDs -> array of strings
  const pids = Array.isArray(productIds)
    ? productIds.map(String).filter(Boolean)
    : productId
      ? [String(productId)]
      : [];

  if (!pids.length) {
    throw new Error("addReviewWithAggregate: productIds required (productId or productIds).");
  }

  const reviewRef = doc(collection(db, "reviews")); // auto-id
  const stars = Number(rating || 0);

  const reviewId = await runTransaction(db, async (tx) => {
    // ---------- 1) READS FIRST (required by Firestore) ----------
    // Read all product docs we will update
    const productsData = [];
    for (const pid of pids) {
      const productRef = doc(db, "products", pid);
      const prodSnap = await tx.get(productRef); // READ
      const prod = prodSnap.exists() ? prodSnap.data() : {};

      const prevCount = Number(prod.reviewsCount || 0);
      const prevSum =
        prod.ratingSum != null
          ? Number(prod.ratingSum)
          : Number(prod.ratingAvg || 0) * prevCount;

      const newCount = prevCount + 1;
      const newSum = prevSum + stars;
      const newAvg = newCount ? Math.round((newSum / newCount) * 100) / 100 : 0;

      productsData.push({
        pid,
        productRef,
        newCount,
        newSum,
        newAvg,
      });
    }

    // ---------- 2) WRITES AFTER ALL READS ----------
    // Create the review
    tx.set(reviewRef, {
      productIds: pids,
      rating: stars,
      message: String(message || ""),
      imageUrl: imageUrl || null,
      userId: userId || null,
      userName: userName || "User",
      orderId: orderId || null,
      items: Array.isArray(items) ? items : [],
      createdAt: serverTimestamp(),
      editedOnce: false,
      version: 1,
    });

    // Update each product aggregate
    for (const { productRef, newCount, newSum, newAvg } of productsData) {
      tx.set(
        productRef,
        {
          reviewsCount: newCount,
          ratingSum: newSum, // keep sum so edits/deletes are exact
          ratingAvg: newAvg,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    return reviewRef.id;
  });

  return reviewId;
}

/**
 * Update a review and fix aggregate (if you allow editing the rating).
 */
export async function updateReviewWithAggregate(
  db,
  reviewId,
  { rating, message, imageUrl }
) {
  const reviewRef = doc(db, "reviews", String(reviewId));

  await runTransaction(db, async (tx) => {
    // READS
    const revSnap = await tx.get(reviewRef);
    if (!revSnap.exists()) throw new Error("Review not found");
    const r = revSnap.data();

    const oldStars = Number(r.rating || 0);
    const newStars = Number(rating ?? oldStars);
    const delta = newStars - oldStars;

    const pid =
      (Array.isArray(r.productIds) && r.productIds[0]) ||
      (Array.isArray(r.items) && (r.items[0]?.productId || r.items[0]?.id)) ||
      null;
    if (!pid) throw new Error("Review has no productId");

    const productRef = doc(db, "products", String(pid));
    const prodSnap = await tx.get(productRef);
    const prod = prodSnap.exists() ? prodSnap.data() : {};
    const count = Number(prod.reviewsCount || 0);
    const sum =
      prod.ratingSum != null
        ? Number(prod.ratingSum)
        : Number(prod.ratingAvg || 0) * count;

    const newSum = sum + delta;
    const newAvg = count ? Math.round((newSum / count) * 100) / 100 : 0;

    // WRITES
    tx.set(
      reviewRef,
      {
        ...(rating != null ? { rating: newStars } : {}),
        ...(message != null ? { message: String(message) } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      productRef,
      { ratingSum: newSum, ratingAvg: newAvg, updatedAt: serverTimestamp() },
      { merge: true }
    );
  });
}

/**
 * Delete a review and fix aggregate (if you allow deletes).
 */
export async function deleteReviewWithAggregate(db, reviewId) {
  const reviewRef = doc(db, "reviews", String(reviewId));

  await runTransaction(db, async (tx) => {
    // READS
    const revSnap = await tx.get(reviewRef);
    if (!revSnap.exists()) return;

    const r = revSnap.data();
    const stars = Number(r.rating || 0);

    const pid =
      (Array.isArray(r.productIds) && r.productIds[0]) ||
      (Array.isArray(r.items) && (r.items[0]?.productId || r.items[0]?.id)) ||
      null;
    if (!pid) return;

    const productRef = doc(db, "products", String(pid));
    const prodSnap = await tx.get(productRef);
    const prod = prodSnap.exists() ? prodSnap.data() : {};
    const prevCount = Number(prod.reviewsCount || 0);
    const prevSum =
      prod.ratingSum != null
        ? Number(prod.ratingSum)
        : Number(prod.ratingAvg || 0) * prevCount;

    const newCount = Math.max(0, prevCount - 1);
    const newSum = Math.max(0, prevSum - stars);
    const newAvg = newCount ? Math.round((newSum / newCount) * 100) / 100 : 0;

    // WRITES
    tx.set(
      productRef,
      {
        reviewsCount: newCount,
        ratingSum: newSum,
        ratingAvg: newAvg,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    tx.delete(reviewRef);
  });
}
