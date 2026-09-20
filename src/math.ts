export function sma(values: number[], window: number): number | null {
  if (window <= 0) {
    throw new Error("window must be positive");
  }

  if (values.length < window) {
    return null;
  }

  const recent = values.slice(-window);
  const sum = recent.reduce((total, value) => total + value, 0);
  return sum / window;
}

export function round(value: number, decimals = 8): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
