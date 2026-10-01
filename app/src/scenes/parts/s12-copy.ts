// Cached xerox material controls used by all six actually drawn generations.
export function xeroxSettings(generation: number) {
  const g = Math.max(0, Math.min(5, generation));
  return { grain: 600 + g * 6000, dropout: g * 600, drift: g * 17, bands: g * 50 };
}
