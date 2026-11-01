export const smooth = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};

// The middle of the viewport is a quiet reading zone. Entry and exit are
// symmetric, so reversing scroll retraces the same pose without a timer.
export function previewPose(distance: number, compact: boolean) {
  const entry = smooth((-distance - .28) / .72);
  const exit = smooth((distance - .28) / .72);
  return {
    y: (entry - exit) * (compact ? 12 : 24),
    angle: (entry - exit) * (compact ? 2 : 5),
  };
}
