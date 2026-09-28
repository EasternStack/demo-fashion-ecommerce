export type SizeChart = {
  kind: "apparel" | "bag" | "eyewear" | "beanie";
  unit: "cm" | "mm";
  columns: string[];
  rows: { size: string; values: number[] }[];
  measureNote: string;
};

const CHARTS: Record<string, SizeChart> = {
  pria: {
    kind: "apparel",
    unit: "cm",
    columns: ["Lingkar Dada", "Panjang Badan", "Bahu", "Lengan"],
    rows: [
      { size: "S", values: [96, 68, 44, 60] },
      { size: "M", values: [100, 70, 46, 61] },
      { size: "L", values: [104, 72, 48, 62] },
      { size: "XL", values: [108, 74, 50, 63] },
    ],
    measureNote: "Ukur serupa pakaian favoritmu yang diletakkan datar, bukan mengukur badan.",
  },
  wanita: {
    kind: "apparel",
    unit: "cm",
    columns: ["Lingkar Dada", "Panjang Badan", "Bahu", "Lengan"],
    rows: [
      { size: "S", values: [88, 62, 38, 56] },
      { size: "M", values: [92, 64, 40, 57] },
      { size: "L", values: [96, 66, 42, 58] },
    ],
    measureNote: "Ukur serupa pakaian favoritmu yang diletakkan datar, bukan mengukur badan.",
  },
  tas: {
    kind: "bag",
    unit: "cm",
    columns: ["Lebar", "Tinggi", "Depth", "Drop Strap"],
    rows: [{ size: "All", values: [38, 42, 12, 28] }],
    measureNote: "Dimensi luar tas; drop strap diukur dari puncak bahu ke ujung strap.",
  },
  kacamata: {
    kind: "eyewear",
    unit: "mm",
    columns: ["Lensa", "Bridge", "Temple"],
    rows: [{ size: "All", values: [52, 21, 145] }],
    measureNote: "Lensa = lebar satu lensa, bridge = jarak antar lensa, temple = panjang gagang.",
  },
  beanie: {
    kind: "beanie",
    unit: "cm",
    columns: ["Lingkar Kepala", "Tinggi"],
    rows: [{ size: "All", values: [58, 22] }],
    measureNote: "Lingkar kepala diukur sejajar dahi; rajutan mengikuti ±2 cm.",
  },
};

export function getSizeChart(categorySlug: string): SizeChart | undefined {
  return CHARTS[categorySlug];
}
