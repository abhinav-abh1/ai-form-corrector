"use client";

import { useEffect, useRef, useState } from "react";
import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";


const LEFT_HIP = 23;
const LEFT_KNEE = 25;
const LEFT_ANKLE =27;
const LEFT_SHOULDER = 11;
const VISIBILITY_THRESHOLD = 0.5
const UP_THRESHOLD = 165;
const DOWN_THRESHOLD = 150;
const GOOD_DEPTH_THRESHOLD  = 50;
const PARTIAL_DEPTH_THRESHOLD = 70;
const DEPTH_SMOOTHING_FACTOR = 0.6;
const SMOOTHING_FACOR = 0.3;
const MIN_TORSO_HEIGHT = 0.15;
const MIN_HIP_DROP = 0.05;

//camera 
const CAMERA_GUIDANCE_DELAY_MS = 1500;
const CAMERA_GUIDANCE_COOLDOWN_MS = 6000;

const FEEDBACK = {
  wrongMovement: "That's not a squat — bend your hips and knees together and lower down",
  tooShallow: "Too shallow, go deeper",
  moderateDepth: (rep: number) => `Rep ${rep}, good rep`,
  deepSquat: (rep: number) => `Rep ${rep}, excellent depth`,
};

function isVisible(point: {visibility?: number}): boolean{
  return typeof point.visibility ==="number" && point.visibility >= VISIBILITY_THRESHOLD;
}

function getCameraGuidance(
  hip: {visibility?: number},
  knee: {visibility?: number},
  ankle: {visibility?: number},
  shoulder: {visibility?: number},
  torsoHeight: number
): string | null {
  if (!isVisible(hip) || !isVisible(knee) || !isVisible(ankle) || !isVisible(shoulder)) {
    return "Step back so your whole body is visible";
  }
  if (torsoHeight < MIN_TORSO_HEIGHT) {
    return "Move closer to the camera";
  }
  return null;
}
function speak (text: string ){
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}
function calculateAngle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) {
    angle = 360 - angle;
  }
  return angle;
}

export default function Home() {
  const [status, setStatus] = useState<string>("checking...");
  const [detectionResult, setDetectionResult] = useState<string>("");
  const [avgConfidence, setAvgConfidence] = useState<number | null>(null);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [formFeedback, setFormFeedback] = useState<string>(""); 


  const squatPhaseRef = useRef<"up" | "down">("up");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null)
  const minAngleThisRef = useRef<number>(180);
  const smoothedAngleRef = useRef<number | null>(null); 
  const isTrackingRef = useRef(false);
  const hipYAtDescentStartRef = useRef<number>(0);
  const maxHipYThisRepRef = useRef<number>(0);
  const smoothedDepthRef = useRef<number | null>(null);
  const repCountRef = useRef<number>(0);
  const framingIssueSinceRef = useRef<number | null>(null);
  const lastGuidanceSpokenAtRef = useRef<number>(0);



  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    fetch(`${apiBaseUrl}/api/health`)
      .then((res) => res.json())
      .then((data) => setStatus(`backend says: ${data.status} (${data.environment})`))
      .catch(() => setStatus("could not reach backend"));
  }, []);

  useEffect(() =>{
    return () => {
      if (animationFrameRef.current !== null){
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  };
  
  const detectLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const poseLandmarker = poseLandmarkerRef.current;
    if (video && canvas && poseLandmarker){
      const result = poseLandmarker.detectForVideo(video, performance.now());
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if(ctx){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if(result.landmarks.length > 0){
          const landmarks = result.landmarks[0];
          const drawingUtils = new DrawingUtils(ctx)

            const hip = landmarks[LEFT_HIP];
            const knee = landmarks[LEFT_KNEE];
            const ankle = landmarks[LEFT_ANKLE];
            const shoulder = landmarks[LEFT_SHOULDER];
            const torsoHeight = Math.abs(hip.y - shoulder.y);
            const guidance = getCameraGuidance(hip, knee, ankle, shoulder, torsoHeight);
            
            if (guidance === null){
              framingIssueSinceRef.current = null;
              const rawAngle = calculateAngle(hip, knee, ankle);
              const smoothed = smoothedAngleRef.current === null
                ? rawAngle
                : SMOOTHING_FACOR * rawAngle + (1 - SMOOTHING_FACOR) * smoothedAngleRef.current;
              smoothedAngleRef.current = smoothed;
              setKneeAngle(smoothed);

              const smoothedDepth = smoothedDepthRef.current === null
                ? rawAngle
                : DEPTH_SMOOTHING_FACTOR * rawAngle + (1 - DEPTH_SMOOTHING_FACTOR) * smoothedDepthRef.current;
              smoothedDepthRef.current = smoothedDepth;

              if (squatPhaseRef.current === "up" && smoothed < DOWN_THRESHOLD){
                squatPhaseRef.current  = "down";
                minAngleThisRef.current = smoothedDepth;
                hipYAtDescentStartRef.current = hip.y;
                maxHipYThisRepRef.current = hip.y;
    
              }  else if (squatPhaseRef.current === "down") {
                  minAngleThisRef.current = Math.min(
                    minAngleThisRef.current,
                    smoothedDepth
                  );
                  maxHipYThisRepRef.current = Math.max(
                    maxHipYThisRepRef.current,
                    hip.y
                  );

                  if (smoothed > UP_THRESHOLD) {
                    squatPhaseRef.current = "up";

                    const hipDrop =
                      maxHipYThisRepRef.current - hipYAtDescentStartRef.current;

                    let feedback: string;

                    if (hipDrop < MIN_HIP_DROP) {
                      feedback = FEEDBACK.wrongMovement;
                    } else {
                      repCountRef.current += 1;
                      setRepCount(repCountRef.current);

                      if (minAngleThisRef.current > PARTIAL_DEPTH_THRESHOLD) {
                        feedback = FEEDBACK.tooShallow;
                      } else if (minAngleThisRef.current > GOOD_DEPTH_THRESHOLD) {
                        feedback = FEEDBACK.moderateDepth(repCountRef.current);
                      } else {
                        feedback = FEEDBACK.deepSquat(repCountRef.current);
                      }
                    }

                    setFormFeedback(feedback);
                    speak(feedback);
                  }
                }

            } else {
              setKneeAngle(null);
              const now = performance.now();
              if (framingIssueSinceRef.current === null) {
                framingIssueSinceRef.current = now;
              }
              const sustainedFor = now - framingIssueSinceRef.current;
              if (sustainedFor >= CAMERA_GUIDANCE_DELAY_MS && now - lastGuidanceSpokenAtRef.current >= CAMERA_GUIDANCE_COOLDOWN_MS) {
                speak(guidance);
                lastGuidanceSpokenAtRef.current = now;
              }
            }
          drawingUtils.drawLandmarks(landmarks, {radius: 4});
          drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS);
          setDetectionResult(`Detected a person: ${landmarks.length} landmarks`);
          const visibilities = landmarks
          .map((point) => point.visibility)
          .filter((v): v is number => typeof v ==="number" );
          if (visibilities.length > 0){
            const avg = visibilities.reduce((sum, v) => sum + v, 0) / visibilities.length;
            setAvgConfidence(avg);
          }


        } else {
          setDetectionResult("No person detected");
          setAvgConfidence(null);
          setKneeAngle(null);
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(detectLoop);
  }

  const startTracking = async () => {
    if (isTrackingRef.current) return;
    isTrackingRef.current = true;

    if (!poseLandmarkerRef.current) {
      setDetectionResult("Loading model...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      );
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        },
        runningMode: "VIDEO",
      });
    }
    animationFrameRef.current = requestAnimationFrame(detectLoop);
  };

  const stopTracking = () =>{
    isTrackingRef.current = false
    if (animationFrameRef.current !== null){
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setDetectionResult("Stopped");
  };

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>AI Form Corrector</h1>
      <p>{status}</p>

      <button onClick={startCamera}>Start camera</button>
      <div style={{ position: "relative", width: 480, marginTop: "1rem" }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: "100%" }} />
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button onClick={startTracking}> Start Tracking</button>
        <button onClick={stopTracking} style = {{marginLeft: "0.5rem"}}> Stop Tracking</button>
        <p>{detectionResult}</p>
        <p>
          Confidence:{" "}
          {avgConfidence !== null
            ? `${(avgConfidence * 100).toFixed(0)}%`
            : "n/a"}
        </p>
        <p>Left knee angle: {kneeAngle !== null ? `${kneeAngle.toFixed(0)}°` : "Leg not clearly visible"}</p>
        <p>Reps: {repCount}</p>
        <p>{formFeedback}</p>
        <button
          onClick={() => {
            setRepCount(0);
            repCountRef.current = 0;
            squatPhaseRef.current = "up";
            minAngleThisRef.current = 180;
            smoothedAngleRef.current = null;
            smoothedDepthRef.current = null;
            hipYAtDescentStartRef.current = 0;
            maxHipYThisRepRef.current = 0;
            setFormFeedback("");
            setKneeAngle(null);
          }}
        >
        Reset Reps
      </button>
      </div>
    </main>
  );
}