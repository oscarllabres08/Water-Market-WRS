/** Public reference from the real order/booking UUID (matches order detail #{id.slice(0,8)}). */
export function formatSourceReference(kind: 'order' | 'laundry', sourceId: string) {
  const prefix = kind === 'laundry' ? 'LY' : 'WM';
  const compact = sourceId.replace(/-/g, '').toUpperCase();
  const short = compact.length >= 8 ? compact.slice(0, 8) : sourceId.slice(0, 8).toUpperCase();
  return `${prefix}-${short}`;
}