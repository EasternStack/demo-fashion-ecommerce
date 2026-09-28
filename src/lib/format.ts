const formatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

export function formatIDR(rupiah: number): string {
  return formatter.format(rupiah).replace(/\s/g, "");
}
