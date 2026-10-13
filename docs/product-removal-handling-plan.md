# Implementation Plan: Store Product Removal & Favorites Retention

## Problem Statement
When a product is deleted or removed from the store (e.g., soft-deleted with `is_active = false` or hard-deleted):
1. **Recently Viewed**: Previously persisted full product objects into `sb_recently_viewed` without filtering against the active catalogue, causing deleted products to linger in "Recently Viewed".
2. **Favorites (Wishlist)**: Previously only stored product IDs (`sb_wishlist`) and mapped them against active catalogue products (`productsById.get(id)`). When a product was deleted or removed from the store, it disappeared from the user's favorites entirely.

## Objective
- Ensure products deleted or removed from the store are **not** displayed in or added to Recently Viewed (`recentlyViewed`).
- Ensure products deleted or removed from the store **continue to be displayed** in Favorites (`wishlist` / `favoriteProducts`), retaining their snapshot metadata while being marked as removed (`isRemoved: true`), disabling checkout/cart actions for those items.

## Architecture & Changes

### 1. Domain Layer (`src/domain/entities/product.ts`)
- Add `isRemoved?: boolean` to the `Product` entity interface.

### 2. Infrastructure Layer (`src/infrastructure/repositories/productRepository.ts`)
- Ensure fallback query in `_fetchProduct` filters for `is_active = true` so inactive products are not erroneously loaded as active.

### 3. Application / Context Layer (`src/presentation/context/StoreContext.tsx`)
- Scope `wishlist`, `favoriteSnapshots`, and `recentlyViewed` strictly to the authenticated `user.id`.
- Store per-user items under `sb_wishlist_${userId}`, `sb_favorite_snapshots_${userId}`, and `sb_recently_viewed_${userId}`.
- Sync favorites with the backend `customer_favorites` table in Supabase.
- Clear `wishlist`, `favoriteProducts`, and `recentlyViewed` when a user is not logged in or logs out.
- Update `addToRecentlyViewed`: reject products when user is not logged in (`!userId`), when product is removed (`isRemoved: true`), or when not in active catalogue.
- Prune/filter `recentlyViewed` against active products once `products` are loaded.
- Ensure `addToCart` ignores items marked with `isRemoved: true`.
- Support passing optional `productSnapshot` in `toggleWishlist(productId, product?)`.

### 4. Presentation Layer
- **`ProductCard.tsx`**:
  - Show a distinct "تمت إزالته من المتجر" overlay badge if `isRemoved: true`.
  - Disable Add to Cart button when `isRemoved: true`.
  - Keep wishlist toggle enabled so user can remove it from favorites if desired.
  - Update `React.memo` comparator to check `product.isRemoved`.
- **`RecentlyViewed.tsx`**:
  - Hidden completely if `!user` or `recentlyViewed.length === 0`.
- **`HomePage.tsx`**:
  - Gate "منتجاتي المفضلة" section to only display when `Boolean(user) && favoriteProducts.length > 0` (removed if logged out or empty).
  - Gate "شاهدتِ مؤخراً" section to only display when `Boolean(user) && recentlyViewed.length > 0`.
- **`ProductDetailsPage.tsx`**:
  - If a removed product from favorites is visited, display it with a removed notice and disabled cart button.
  - Do **not** call `addToRecentlyViewed` for removed products or non-logged-in users.

### 5. Verification
- Add unit tests in `tests/unit/productRemovalFavorites.test.ts` verifying:
  - Deleted products are excluded from `recentlyViewed`.
  - Deleted products are retained in `favoriteProducts` with `isRemoved: true`.
  - Favorites and recently viewed are personalized and isolated per `user.id`.
  - Non-logged-in users have no favorites or recently viewed sections.
  - `addToRecentlyViewed` rejects removed products and unauthenticated users.
  - `addToCart` rejects removed products.
- Run `vitest run tests/unit` and `npm run typecheck` to confirm 100% test pass and zero type errors.
