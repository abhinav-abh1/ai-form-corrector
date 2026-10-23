export const LEFT_HIP = 23;
export const LEFT_KNEE = 25;
export const LEFT_ANKLE = 27;
export const LEFT_SHOULDER = 11;

export const VISIBILITY_THRESHOLD = 0.5;
export const UP_THRESHOLD = 165;
export const DOWN_THRESHOLD = 150;
export const GOOD_DEPTH_THRESHOLD = 50;
export const PARTIAL_DEPTH_THRESHOLD = 70;
export const DEPTH_SMOOTHING_FACTOR = 0.6;
export const SMOOTHING_FACTOR = 0.3;
export const MIN_HIP_DROP = 0.05;

export const MAX_TORSO_LEAN_DEGREES = 55;
export const TORSO_LEAN_SMOOTHING = 0.4;


export const CAMERA_GUIDANCE_DELAY_MS = 1500;
export const CAMERA_GUIDANCE_COOLDOWN_MS = 6000;


export const RIGHT_SHOULDER = 12;
export const RIGHT_ANKLE = 28;
export const RIGHT_KNEE = 26;



export const MIN_TORSO_HEIGHT = 0.19;   
export const MAX_TORSO_HEIGHT = 0.28;   
export const MIN_STANCE_WIDTH_RATIO = 0.55;
export const MAX_STANCE_WIDTH_RATIO = 1.00;
export const STANCE_WIDTH_SMOOTHING = 0.5;


export const SQUAT_RECOMMENDED_VIEW =
  "Face the camera directly, with your whole body in frame.";

export const FEEDBACK = {
  wrongMovement:
    "That's not a squat — bend your hips and knees together and lower down",
  tooShallow: "Too shallow, go deeper",
  moderateDepth: (rep: number) => `Rep ${rep}, good rep`,
  deepSquat: (rep: number) => `Rep ${rep}, excellent depth`,
  chestDown: "Keep your chest up — don't lean forward",
};

export const CAMERA_FEEDBACK = {
  notFullyVisible: "Step back so your whole body is visible",
  turnToFaceCamera: "Turn to face the camera directly",
  tooClose: "You're too close — step back a little",
  tooFar: "Move a little closer to the camera",
  stanceTooNarrow: "Widen your stance a bit",
  stanceTooWide: "Bring your feet in a little",
};