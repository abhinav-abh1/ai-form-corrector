"use client";

import { useEffect, useRef, useState } from "react";
import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { count } from "console";

const LEFT_HIP = 23;
const LEFT_KNEE = 25;
const LEFT_ANKLE =27;
const VISIBILITY_THRESHOLD = 0.5
const UP_THRESHOLD = 160;
const DOWN_THRESHOLD = 100;
const GOOD_DEPTH_THRESHOLD  = 90;


function isVisible(point: {visibility?: number}): boolean{
  return typeof point.visibility ==="number" && point.visibility >= VISIBILITY_THRESHOLD;
}
function calculateAngle(
  a: {x: number; y: number},
  b: {x: number; y: number},
  c: {x: number; y: number}
):number {
  const radians  = Math.atan2(c.y - b.y, c.x- b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians *100) / Math.PI);
  if (angle > 100){
    angle = 360 - angle;
  }
  return angle
}

export default function Home() {
  const [status, setStatus] = useState<string>("checking...");
  const [detectionResult, setDetectionResult] = useState<string>("");
  const [avgConfidence, setAvgConfidence] = useState<number | null>(null);
  const [kneeAngle, setKneeAngle] = useState<number | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [formFeedback, setFromFeedback] = useState<string>(""); 


  const squatPhaseRef = useRef<"up" | "down">("up");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null)
  const minAngleThisRef = useRef<number>(180);
   


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
            
            if (isVisible(hip) && isVisible(knee) && isVisible(ankle)){
              const angle = calculateAngle(hip, knee, ankle);
              setKneeAngle(angle);
              if (squatPhaseRef.current === "up" && angle < DOWN_THRESHOLD){
                squatPhaseRef.current = "down";
                minAngleThisRef.current = angle;
              }
              else if (squatPhaseRef.current === "down"){
                minAngleThisRef.current = Math.min(minAngleThisRef.current, angle);
                
                if (angle > UP_THRESHOLD){
                  squatPhaseRef.current = "up";
                  setRepCount((count) => count + 1)
                  setFromFeedback(
                    minAngleThisRef.current <= GOOD_DEPTH_THRESHOLD
                    ? "Good depth!"
                    : "Go a bit lower next time"
                  )
                }
              }
            } else {
              setKneeAngle(null);
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
      animationFrameRef.current = requestAnimationFrame(detectLoop);
    }

  };

  const stopTracking = () =>{
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
        <p>Confidence: {avgConfidence !== null ? `${avgConfidence * 100}.toFixed(0)%` : "n/a"}</p>
        <p>Left knee angle: {kneeAngle !== null ? `${kneeAngle.toFixed(0)}°` : "Leg not clearly visible"}</p>\
        <p>Reps: {repCount}</p>
        <p>{formFeedback}</p>
        <button onClick={() => {
          setRepCount(0);
          squatPhaseRef.current = "up";
        }}> Reset Reps</button>
      </div>
    </main>
  );
}