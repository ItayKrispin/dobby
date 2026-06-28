export function formatPrice(agorot: number): string {
  const shekel = agorot / 100;
  return `₪${shekel.toLocaleString("he-IL")}`;
}

export function parsePriceToAgorot(shekel: number): number {
  return Math.round(shekel * 100);
}
