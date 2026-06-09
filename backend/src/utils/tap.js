export function calculateDepressionDelta(baseDelta, depressionMultiplier = 1) {
  const delta = Number(baseDelta) || 0;
  return Math.max(0, delta * depressionMultiplier);
}
