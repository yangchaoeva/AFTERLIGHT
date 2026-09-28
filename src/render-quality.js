export function pixelRatioForQuality(quality, deviceRatio) {
  const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const cap = { low: 1, medium: 1.25, high: 1.75, native: ratio }[quality] ?? 1.25;
  return Math.min(ratio, cap);
}
