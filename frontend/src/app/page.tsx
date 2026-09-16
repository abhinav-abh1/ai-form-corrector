"use client";

import { useEffect, useState } from "react";

// This page intentionally does nothing feature-related yet. Its only job right now is to
// prove the walking skeleton works: the browser can reach the backend, over the network
// path Docker Compose sets up, and render what comes back. Real camera/pose-estimation
// code replaces this in the next phase.
export default function Home() {
  const [status, setStatus] = useState<string>("checking...");

  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    fetch(`${apiBaseUrl}/api/health`)
      .then((res) => res.json())
      .then((data) => setStatus(`backend says: ${data.status} (${data.environment})`))
      .catch(() => setStatus("could not reach backend"));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>AI Form Corrector</h1>
      <p>{status}</p>
    </main>
  );
}
