export const smooth = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};

// Centre is expressed in viewport heights: arrive at 1.15, settle at .55.
// A single scroll position owns frame and demonstration, with no delayed loop.
export function previewPose(centre: number, compact: boolean) {
  const progress = smooth((1.15 - centre) / .6);
  const demo = smooth((.94 - centre) / .39);
  return {
    progress, demo,
    y: (1 - progress) * (compact ? 24 : 48),
    angle: (1 - progress) * (compact ? 3 : 8),
    scale: 1 - (1 - progress) * (compact ? .04 : .08),
  };
}

export const sequenceProgress = (progress: number, index: number, count: number) => smooth(progress * count - index);
