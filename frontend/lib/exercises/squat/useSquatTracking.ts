"use client";

import { useRef, useState } from "react";
import {
  LEFT_HIP,
  LEFT_KNEE,
  LEFT_ANKLE,
  LEFT_SHOULDER,
  RIGHT_SHOULDER,
  RIGHT_ANKLE,
  VISIBILITY_THRESHOLD,
  UP_THRESHOLD,
  DOWN_THRESHOLD,
  GOOD_DEPTH_THRESHOLD,
  PARTIAL_DEPTH_THRESHOLD,
  DEPTH_SMOOTHING_FACTOR,
  SMOOTHING_FACTOR,
  MIN_TORSO_HEIGHT,
  MAX_TORSO_HEIGHT,
  MIN_HIP_DROP,
  MAX_TORSO_LEAN_DEGREES,
  TORSO_LEAN_SMOOTHING,
  MIN_STANCE_WIDTH_RATIO,
  MAX_STANCE_WIDTH_RATIO,
  STANCE_WIDTH_SMOOTHING,
  CAMERA_GUIDANCE_DELAY_MS,
  CAMERA_GUIDANCE_COOLDOWN_MS,
  CAMERA_FEEDBACK,
  FEEDBACK,
  SQUAT_RECOMMENDED_VIEW,
  RIGHT_KNEE,
} from "./constants";
import { isVisible, calculateAngle, calculateTorsoLean, calculateStanceWidthRatio,calculateKneeAnkleRatio, type Landmark } from "../../pose-math";
import { speak } from "../../speak";
import type { SessionRecord } from "../../session-storage";

function getCameraGuidance(
  hip: Landmark,
  knee: Landmark,
  ankle: Landmark,
  shoulder: Landmark,
  rightShoulder: Landmark,
  rightAnkle: Landmark,
  rightKnee: Landmark,
  torsoHeight: number
): string | null {
  const leftSideVisible =
    isVisible(hip, VISIBILITY_THRESHOLD) &&
    isVisible(knee, VISIBILITY_THRESHOLD) &&
    isVisible(ankle, VISIBILITY_THRESHOLD) &&
    isVisible(shoulder, VISIBILITY_THRESHOLD);

  const rightSideVisible =
    isVisible(rightShoulder, VISIBILITY_THRESHOLD) &&
    isVisible(rightAnkle, VISIBILITY_THRESHOLD) &&
    isVisible(rightKnee, VISIBILITY_THRESHOLD);

  if (!leftSideVisible && !rightSideVisible) {
    return CAMERA_FEEDBACK.notFullyVisible;
  }
  if (!leftSideVisible || !rightSideVisible) {
    return CAMERA_FEEDBACK.turnToFaceCamera;
  }
  if (torsoHeight > MAX_TORSO_HEIGHT) {
    return CAMERA_FEEDBACK.tooClose;
  }
  if (torsoHeight < MIN_TORSO_HEIGHT) {
    return CAMERA_FEEDBACK.tooFar;
  }
  return null;
}

function getStanceGuidance(stanceWidthRatio: number): string | null {
  if (stanceWidthRatio < MIN_STANCE_WIDTH_RATIO) {
    return CAMERA_FEEDBACK.stanceTooNarrow;
  }
  if (stanceWidthRatio > MAX_STANCE_WIDTH_RATIO) {
    return CAMERA_FEEDBACK.stanceTooWide;
  }
  return null;
}


export function useSquatTracking() {
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [formFeedback, setFormFeedback] = useState<string>("");

  const squatPhaseRef = useRef<"up" | "down">("up");
  const minAngleThisRef = useRef<number>(180);
  const smoothedAngleRef = useRef<number | null>(null);
  const hipYAtDescentStartRef = useRef<number>(0);
  const maxHipYThisRepRef = useRef<number>(0);
  const smoothedDepthRef = useRef<number | null>(null);
  const repCountRef = useRef<number>(0);
  const framingIssueSinceRef = useRef<number | null>(null);
  const lastGuidanceSpokenAtRef = useRef<number>(0);
  const maxLeanThisRepRef = useRef<number>(0);
  const smoothedLeanRef = useRef<number | null>(null);

  const shallowAttemptsThisSessionRef = useRef<number>(0);
  const moderateRepsThisSessionRef = useRef<number>(0);
  const deepRepsThisSessionRef = useRef<number>(0);

  const smoothedStanceWidthRef = useRef<number | null>(null);
  const stanceIssueSinceRef = useRef<number | null>(null);
 //
  const lastCalibrationLogRef = useRef<number>(0);

  const calibrationMinKneeRatioRef = useRef<number>(Infinity);
  const calibrationMaxKneeRatioRef = useRef<number>(-Infinity);

function processFrame(landmarks: Landmark[]) {
  const hip = landmarks[LEFT_HIP];
  const knee = landmarks[LEFT_KNEE];
  const ankle = landmarks[LEFT_ANKLE];
  const shoulder = landmarks[LEFT_SHOULDER];
  const rightShoulder = landmarks[RIGHT_SHOULDER];
  const rightAnkle = landmarks[RIGHT_ANKLE];
  const torsoHeight = Math.abs(hip.y - shoulder.y);
  const rightKnee = landmarks[RIGHT_KNEE];
const guidance = getCameraGuidance(hip, knee, ankle, shoulder, rightShoulder, rightAnkle, rightKnee, torsoHeight);

  if (guidance !== null) {
    setKneeAngle(null);
    const now = performance.now();
    if (framingIssueSinceRef.current === null) {
      framingIssueSinceRef.current = now;
    }
    const sustainedFor = now - framingIssueSinceRef.current;
    if (
      sustainedFor >= CAMERA_GUIDANCE_DELAY_MS &&
      now - lastGuidanceSpokenAtRef.current >= CAMERA_GUIDANCE_COOLDOWN_MS
    ) {
      speak(guidance);
      lastGuidanceSpokenAtRef.current = now;
    }
    return;
  }

  framingIssueSinceRef.current = null;

  const rawAngle = calculateAngle(hip, knee, ankle);
  const smoothed =
    smoothedAngleRef.current === null
      ? rawAngle
      : SMOOTHING_FACTOR * rawAngle + (1 - SMOOTHING_FACTOR) * smoothedAngleRef.current;
  smoothedAngleRef.current = smoothed;
  setKneeAngle(smoothed);

  const smoothedDepth =
    smoothedDepthRef.current === null
      ? rawAngle
      : DEPTH_SMOOTHING_FACTOR * rawAngle + (1 - DEPTH_SMOOTHING_FACTOR) * smoothedDepthRef.current;
  smoothedDepthRef.current = smoothedDepth;

  const rawLean = calculateTorsoLean(shoulder, hip);
  const smoothedLean =
    smoothedLeanRef.current === null
      ? rawLean
      : TORSO_LEAN_SMOOTHING * rawLean + (1 - TORSO_LEAN_SMOOTHING) * smoothedLeanRef.current;
  smoothedLeanRef.current = smoothedLean;

  const rawStanceWidthRatio = calculateStanceWidthRatio(ankle, rightAnkle, shoulder, rightShoulder);
  const rawKneeAnkleRatio = calculateKneeAnkleRatio(knee, rightKnee, ankle, rightAnkle);
  const smoothedStanceWidthRatio =
    smoothedStanceWidthRef.current === null
      ? rawStanceWidthRatio
      : STANCE_WIDTH_SMOOTHING * rawStanceWidthRatio + (1 - STANCE_WIDTH_SMOOTHING) * smoothedStanceWidthRef.current;
  smoothedStanceWidthRef.current = smoothedStanceWidthRatio;

if (squatPhaseRef.current === "up") {
  const stanceGuidance = getStanceGuidance(smoothedStanceWidthRatio);
  const now = performance.now();

  if (stanceGuidance !== null) {
    if (stanceIssueSinceRef.current === null) {
      stanceIssueSinceRef.current = now;
    }
    const sustainedFor = now - stanceIssueSinceRef.current;

    if (sustainedFor >= CAMERA_GUIDANCE_DELAY_MS) {

      if (now - lastGuidanceSpokenAtRef.current >= CAMERA_GUIDANCE_COOLDOWN_MS) {
        speak(stanceGuidance);
        lastGuidanceSpokenAtRef.current = now;
      }
      return;
    }

  } else {
    stanceIssueSinceRef.current = null;
  }

  if (rawAngle   < DOWN_THRESHOLD) {
    squatPhaseRef.current = "down";
    minAngleThisRef.current = smoothedDepth;
    calibrationMinKneeRatioRef.current = rawKneeAnkleRatio;
    calibrationMaxKneeRatioRef.current = rawKneeAnkleRatio;
    hipYAtDescentStartRef.current = hip.y;
    maxHipYThisRepRef.current = hip.y;
  }
} else if (squatPhaseRef.current === "down") {
    minAngleThisRef.current = Math.min(minAngleThisRef.current, smoothedDepth);
    maxHipYThisRepRef.current = Math.max(maxHipYThisRepRef.current, hip.y);
    maxLeanThisRepRef.current = Math.max(maxLeanThisRepRef.current, smoothedLean);
    calibrationMinKneeRatioRef.current = Math.min(calibrationMinKneeRatioRef.current, rawKneeAnkleRatio);
    calibrationMinKneeRatioRef.current = Math.min(calibrationMinKneeRatioRef.current, rawKneeAnkleRatio);

    if (rawAngle   > UP_THRESHOLD) {
      squatPhaseRef.current = "up";
      //
      const hipDrop = maxHipYThisRepRef.current - hipYAtDescentStartRef.current;
      const repType = hipDrop < MIN_HIP_DROP ? "invalid" : "valid";
      console.log(
        `calibration [${repType}] — knee/ankle ratio min: ${calibrationMinKneeRatioRef.current.toFixed(2)}, max: ${calibrationMaxKneeRatioRef.current.toFixed(2)}`
      );//

      let feedback: string;

      if (hipDrop < MIN_HIP_DROP) {
        feedback = FEEDBACK.wrongMovement;
      } else {
        const isDeepEnough = minAngleThisRef.current <= GOOD_DEPTH_THRESHOLD;
        const isTooShallow = minAngleThisRef.current > PARTIAL_DEPTH_THRESHOLD;

        if (isTooShallow) {
          shallowAttemptsThisSessionRef.current += 1;
          feedback = FEEDBACK.tooShallow;
        } else {
          repCountRef.current += 1;
          setRepCount(repCountRef.current);

          if (isDeepEnough) {
            deepRepsThisSessionRef.current += 1;
          } else {
            moderateRepsThisSessionRef.current += 1;
          }

          const isExcessiveLean = maxLeanThisRepRef.current > MAX_TORSO_LEAN_DEGREES;

          if (isExcessiveLean && !isDeepEnough) {
            feedback = FEEDBACK.chestDown;
          } else if (isDeepEnough) {
            feedback = FEEDBACK.deepSquat(repCountRef.current);
          } else {
            feedback = FEEDBACK.moderateDepth(repCountRef.current);
          }
        }
      }

      maxLeanThisRepRef.current = 0;
      setFormFeedback(feedback);
      speak(feedback);
    }
  }
}

  
  function clearDisplay() {
    setKneeAngle(null);
  }

  function reset() {
    setRepCount(0);
    repCountRef.current = 0;
    squatPhaseRef.current = "up";
    minAngleThisRef.current = 180;
    smoothedAngleRef.current = null;
    smoothedDepthRef.current = null;
    hipYAtDescentStartRef.current = 0;
    maxHipYThisRepRef.current = 0;
    maxLeanThisRepRef.current = 0;
    smoothedLeanRef.current = null;
    moderateRepsThisSessionRef.current = 0;
    deepRepsThisSessionRef.current = 0;
    shallowAttemptsThisSessionRef.current = 0;
    smoothedStanceWidthRef.current = null;
    stanceIssueSinceRef.current = null;
    setFormFeedback("");
    setKneeAngle(null);
  }

  function resetSessionCounters() {
    repCountRef.current = 0;
    setRepCount(0);
    moderateRepsThisSessionRef.current = 0;
    deepRepsThisSessionRef.current = 0;
    shallowAttemptsThisSessionRef.current = 0;
  }

  function endSession(): SessionRecord | null {
    if (repCountRef.current === 0) {
      resetSessionCounters();
      return null;
    }
    const session: SessionRecord = {
      date: new Date().toISOString(),
      totalReps: repCountRef.current,
      moderateReps: moderateRepsThisSessionRef.current,
      deepReps: deepRepsThisSessionRef.current,
      shallowAttempts: shallowAttemptsThisSessionRef.current,
    };
    resetSessionCounters();
    return session;
  }

  return {
    kneeAngle,
    repCount,
    formFeedback,
    recommendedView: SQUAT_RECOMMENDED_VIEW,
    processFrame,
    clearDisplay,
    reset,
    endSession,
  };
}