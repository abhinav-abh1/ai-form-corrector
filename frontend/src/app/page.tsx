"use client";

import { useEffect, useRef, useState } from "react";
import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from "recharts";
import { Session } from "inspector/promises";


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

// lean angle 
const MAX_TORSO_LEAN_DEGREES = 55;
const TORSO_LEAN_SMOOTHING = 0.4;
//camera 
const CAMERA_GUIDANCE_DELAY_MS = 1500;
const CAMERA_GUIDANCE_COOLDOWN_MS = 6000;

const FEEDBACK = {
  wrongMovement: "That's not a squat — bend your hips and knees together and lower down",
  tooShallow: "Too shallow, go deeper",
  moderateDepth: (rep: number) => `Rep ${rep}, good rep`,
  deepSquat: (rep: number) => `Rep ${rep}, excellent depth`,
  chestDown: "Keep your chest up — don't lean forward",
};

type SessionRecord = {
  date: string;
  totalReps: number;
  moderateReps: number;
  deepReps: number;
  shallowAttempts: number;
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

// Lean angle calculation helper function 
function calculateTorsoLean(
  shoulder: {x: number; y: number},
  hip: {x: number; y: number}
): number {
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;

  const radians = Math.atan2(dx, -dy);
  let degrees = Math.abs((radians * 180) / Math.PI);

  if (degrees > 90) degrees = 180 - degrees;
  return degrees;
}

// Session storage functions
const SESSION_STORAGE_KEY = "workoutSessions";

function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSession(session: SessionRecord) {
  const updated = [...loadSessions(), session];
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
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
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);

  //video dimension
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(4 / 3);
  //
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

// session reps Refs
  const shallowAttemptsThisSessionRef = useRef<number>(0);
  const moderateRepsThisSessionRef = useRef<number>(0);
  const deepRepsThisSessionRef = useRef<number>(0);
//

// lean angle user ref
  const maxLeanThisRepRef = useRef<number>(0);
  const smoothedLeanRef = useRef<number | null>(null);

// chart data
const chartData = sessionHistory.map((session, index) =>({
  session: `#${index + 1}`,
  totalReps: session.totalReps,
  deepPercentage:
    session.totalReps > 0 
      ? Math.round((session.deepReps / session.totalReps) * 100)
      : 0,
}) );
//
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

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current;
    if (video && video.videoWidth && video.videoHeight) {
      setVideoAspectRatio(video.videoWidth / video.videoHeight);
    }
  };
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  };

  useEffect(() => {
    setSessionHistory(loadSessions());
  }, []);

// clear session 
  const clearHistory = () => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  setSessionHistory([]);
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

              // lean angle calculation 
              const rawLean = calculateTorsoLean(shoulder, hip);
              const smoothedLean = smoothedLeanRef.current === null
                ? rawLean
                : TORSO_LEAN_SMOOTHING * rawLean + (1 - TORSO_LEAN_SMOOTHING) * smoothedLeanRef.current;
              smoothedLeanRef.current = smoothedLean;
              // 
            

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

                  // lean angle
                  maxLeanThisRepRef.current = Math.max(maxLeanThisRepRef.current, smoothedLean);
                  //
                  if (smoothed > UP_THRESHOLD) {
                    squatPhaseRef.current = "up";

                    const hipDrop =
                      maxHipYThisRepRef.current - hipYAtDescentStartRef.current;

                    let feedback: string;

                    if (hipDrop < MIN_HIP_DROP) {
                      feedback = FEEDBACK.wrongMovement;
                    } else {
                      const isDeepEnough = minAngleThisRef.current <= GOOD_DEPTH_THRESHOLD;
                      const isTooShallow = minAngleThisRef.current > PARTIAL_DEPTH_THRESHOLD;

                      if(isTooShallow) {
                        shallowAttemptsThisSessionRef.current += 1;
                        feedback = FEEDBACK.tooShallow;
                      } else {
                        repCountRef.current += 1;
                        setRepCount(repCountRef.current);
                        
                        if(isDeepEnough) {
                          deepRepsThisSessionRef.current += 1;
                        } else {
                          moderateRepsThisSessionRef.current += 1;
                        }

                      // lean angle
                      const isExcessiveLean = maxLeanThisRepRef.current > MAX_TORSO_LEAN_DEGREES;

                      if (isExcessiveLean && !isDeepEnough){
                        feedback = FEEDBACK.chestDown;
                      //
                      } else if (isDeepEnough) {
                        feedback = FEEDBACK.deepSquat(repCountRef.current);
                      } else {
                        feedback = FEEDBACK.moderateDepth(repCountRef.current);
                      }
                    }
                  }
                    // lean angle
                    maxLeanThisRepRef.current = 0;
                    //
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

   const stopTracking = () => {
    isTrackingRef.current = false;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setDetectionResult("Stopped");

    if (repCountRef.current > 0) {
      const session: SessionRecord = {
        date: new Date().toISOString(),
        totalReps: repCountRef.current,
        moderateReps: moderateRepsThisSessionRef.current,
        deepReps: deepRepsThisSessionRef.current,
        shallowAttempts: shallowAttemptsThisSessionRef.current,
      };

      saveSession(session);
      setSessionHistory((prev) => [...prev, session]);
    }

    repCountRef.current = 0;
    setRepCount(0);
    moderateRepsThisSessionRef.current = 0;
    deepRepsThisSessionRef.current = 0;
    shallowAttemptsThisSessionRef.current = 0;
  };

return (
  <main className="min-h-screen bg-[#0a0a0b] text-zinc-100 font-sans antialiased selection:bg-cyan-500/30">
    {/* Top bar */}
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0a0a0b]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Form<span className="text-cyan-400">Correct</span>
          </h1>
          <span className="hidden text-xs text-zinc-500 sm:inline">AI squat coach</span>
        </div>
        <p className="truncate max-w-[140px] text-right text-[11px] text-zinc-500 sm:max-w-none">
          {status}
        </p>
      </div>
    </header>

    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      {/* Camera stage — the hero */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_20px_50px_-20px_rgba(0,0,0,0.8)]">
        <div
          className="relative w-full"
          style={{ aspectRatio: videoAspectRatio }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            onLoadedMetadata={handleVideoLoadedMetadata}
            className="h-full w-full object-contain"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
          />

          {/* Live overlay metrics */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-3">
            <div className="rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Reps</p>
              <p className="text-2xl font-bold tabular-nums leading-none text-white">
                {repCount}
              </p>
            </div>
            <div className="rounded-lg bg-black/60 px-3 py-1.5 text-right backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">Knee</p>
              <p className="text-lg font-semibold tabular-nums leading-none text-cyan-300">
                {kneeAngle !== null ? `${kneeAngle.toFixed(0)}°` : "—"}
              </p>
            </div>
          </div>

          {/* Confidence pill */}
          {avgConfidence !== null && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-zinc-300 backdrop-blur-sm">
              {(avgConfidence * 100).toFixed(0)}% conf
            </div>
          )}
        </div>
      </section>

      {/* Controls */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <button
          onClick={startCamera}
          className="rounded-xl border border-white/10 bg-zinc-900 py-3 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-zinc-800 active:scale-[0.98]"
        >
          Camera
        </button>
        <button
          onClick={startTracking}
          className="rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-black shadow-[0_0_20px_-4px_rgba(34,211,238,0.5)] transition hover:bg-cyan-400 active:scale-[0.98]"
        >
          Track
        </button>
        <button
          onClick={stopTracking}
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 py-3 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20 active:scale-[0.98]"
        >
          Stop
        </button>
      </div>

      {/* Detection status + feedback */}
      <div className="mt-4 space-y-3">
        {detectionResult && (
          <p className="text-center text-xs text-zinc-500">{detectionResult}</p>
        )}

        {formFeedback && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-sm font-medium leading-snug text-cyan-100">
            {formFeedback}
          </div>
        )}
      </div>

      {/* Reset */}
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
          maxLeanThisRepRef.current = 0;
          smoothedLeanRef.current = null;
          moderateRepsThisSessionRef.current = 0;
          deepRepsThisSessionRef.current = 0;
          shallowAttemptsThisSessionRef.current = 0;
          setFormFeedback("");
          setKneeAngle(null);
        }}
        className="mt-4 w-full rounded-xl border border-dashed border-zinc-700 py-2.5 text-sm text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-300"
      >
        Reset session
      </button>

      {/* Trends */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-zinc-400">Progress</h2>

        {chartData.length < 2 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-600">
            Complete at least two sessions to unlock trends.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/5 bg-zinc-900/50 p-4">
              <p className="mb-3 text-xs text-zinc-500">Reps per session</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="session" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalReps"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#22d3ee", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-white/5 bg-zinc-900/50 p-4">
              <p className="mb-3 text-xs text-zinc-500">Deep-depth reps (%)</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="session" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                    formatter={(value) => [`${value ?? 0}%`, "Deep"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="deepPercentage"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#a78bfa", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* Session history */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-400">History</h2>
          {sessionHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-zinc-600 transition hover:text-rose-400"
            >
              Clear all
            </button>
          )}
        </div>

        {sessionHistory.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-600">
            No sessions yet. Finish a tracked set to log it here.
          </p>
        ) : (
          <ul className="space-y-2">
            {[...sessionHistory].reverse().map((session, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-zinc-900/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {session.totalReps}{" "}
                    <span className="font-normal text-zinc-500">reps</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {session.deepReps} deep · {session.moderateReps} moderate · {session.shallowAttempts} shallow
                  </p>
                </div>
                <time className="shrink-0 text-right text-[11px] text-zinc-600">
                  {new Date(session.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  <br />
                  {new Date(session.date).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  </main>
);
}