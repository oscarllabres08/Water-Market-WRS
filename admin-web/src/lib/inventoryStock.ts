/** Alert when tracked stock is at or below this count (pieces). */
export const LOW_STOCK_THRESHOLD = 10;

export type CatalogCategory = 'water' | 'other' | 'ice';

export function tracksStock(category: CatalogCategory): boolean {
  return category === 'other' || category === 'ice';
}

export function isLowStock(stockQuantity: number | null | undefined): boolean {
  if (stockQuantity == null) return false;
  return stockQuantity <= LOW_STOCK_THRESHOLD;
}

export function stockLabel(stockQuantity: number | null | undefined): string {
  if (stockQuantity == null) return '';
  if (stockQuantity <= 0) return 'Out of stock';
  if (isLowStock(stockQuantity)) return `Low stock · ${stockQuantity} pcs left`;
  return `${stockQuantity} pcs in stock`;
}
