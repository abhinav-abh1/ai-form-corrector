export type Point = { x: number; y: number };
export type Landmark = Point & { visibility?: number };

export function isVisible(point: Landmark, threshold = 0.5): boolean {
  return typeof point.visibility === "number" && point.visibility >= threshold;
}

export function calculateAngle(a: Point, b: Point, c: Point): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

export function calculateTorsoLean(shoulder: Point, hip: Point): number {
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  const radians = Math.atan2(dx, -dy);
  let degrees = Math.abs((radians * 180) / Math.PI);
  if (degrees > 90) degrees = 180 - degrees;
  return degrees;
}

export function calculateStanceWidthRatio(
  leftAnkle: Point,
  rightAnkle: Point,
  leftShoulder: Point,
  rightShoulder: Point
): number {
  const ankleDistance = Math.abs(leftAnkle.x - rightAnkle.x);
  const shoulderDistance = Math.abs(leftShoulder.x - rightShoulder.x);
  if (shoulderDistance === 0) return 0;
  return ankleDistance / shoulderDistance;
}

export function calculateKneeAnkleRatio(
  leftKnee: Point,
  rightKnee: Point,
  leftAnkle: Point,
  rightAnkle: Point
): number {
  const kneeDistance = Math.abs(leftKnee.x - rightKnee.x);
  const ankleDistance = Math.abs(leftAnkle.x - rightAnkle.x);
  if (ankleDistance === 0) return 0;
  return kneeDistance / ankleDistance;
}