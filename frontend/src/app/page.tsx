"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState<string>("checking...");
  const videoRef = useRef<HTMLVideoElement>(null);   // NEW

  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    fetch(`${apiBaseUrl}/api/health`)
      .then((res) => res.json())
      .then((data) => setStatus(`backend says: ${data.status} (${data.environment})`))
      .catch(() => setStatus("could not reach backend"));
  }, []);

  // NEW
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  };

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>AI Form Corrector</h1>
      <p>{status}</p>

      {/* NEW */}
      <button onClick={startCamera}>Start camera</button>
      <video ref={videoRef} autoPlay playsInline style={{ width: 480, marginTop: "1rem" }} />
    </main>
  );
}