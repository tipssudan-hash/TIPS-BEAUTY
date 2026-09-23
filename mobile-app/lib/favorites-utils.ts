export function toggleFavoriteId(ids: string[], productId: string): string[] {
  return ids.includes(productId) ? ids.filter((id) => id !== productId) : [...ids, productId];
}

export function favoriteProducts<T extends { id: string }>(products: T[], ids: string[]): T[] {
  const idSet = new Set(ids);
  return products.filter((product) => idSet.has(product.id));
}
