export function eur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}
