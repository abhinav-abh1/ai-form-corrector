# AI Form Corrector

Real-time, on-device workout form analysis. Uses your webcam to track body landmarks, measure joint angles, count reps, grade form quality, and deliver spoken coaching feedback.

Built as a multi-exercise platform. **Squat is the first fully implemented exercise**; the same camera → pose → FSM → feedback pipeline is designed to extend to push-ups, lunges, and other movements.

No video ever leaves the device. Pose inference and form logic run entirely in the browser.

**Repository:** [github.com/abhinav-abh1/ai-form-corrector](https://github.com/abhinav-abh1/ai-form-corrector)

---

## Features

| Feature | Description |
|---------|-------------|
| **Live pose tracking** | MediaPipe Pose Landmarker (lite model) runs in-browser via WASM. 33 landmarks, skeleton overlay on camera feed. |
| **Rep counting** | Finite-state machine with hysteresis and signal smoothing to avoid double-counts from noise. |
| **Depth / form grading** | Multi-tier classification (e.g. not a valid attempt → too shallow → moderate → excellent). Only real attempts that pass movement-specific gates count as reps. |
| **Form cues** | Biomechanical checks (e.g. torso lean / “chest up”) plus spoken feedback via the Web Speech API. |
| **Camera guidance** | Voice prompts when the body is out of frame or too far from the camera (with sustained-duration + cooldown logic). |
| **Session history** | Local persistence of every completed set: total reps and quality breakdown. |
| **Progress trends** | Line charts across sessions — volume and quality metrics over time. |
| **Zero server latency for ML** | All inference and coaching happens client-side. Backend is reserved for future account / history sync. |
| **Multi-exercise ready** | Architecture (landmarks, thresholds, FSM, feedback) is exercise-agnostic. Squat is complete; other movements reuse the same pipeline with their own landmarks, thresholds, and cues. |

### Currently supported

- **Squat** — full pipeline: knee-angle tracking, hip-drop gate, depth grading, torso-lean check, spoken feedback, session logging, and trends.

### Planned exercises

- Push-ups, lunges, bicep curls, and more — each will plug into the existing camera, pose model, state-machine, and feedback layers.

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | Next.js (React, TypeScript, Tailwind) | Camera, pose inference, UI, TTS |
| Pose estimation | `@mediapipe/tasks-vision` (`pose_landmarker_lite`) | Fully on-device, no training required |
| Charts | Recharts | Session volume & quality trends |
| Backend | FastAPI (Python) | Health check today; future home for accounts & model serving |
| Database | PostgreSQL (Docker Compose) | Provisioned, not yet used by app logic |
| Infra | Docker + Docker Compose | One Dockerfile per service |

**Architecture decision:** pose inference and form analysis stay in the browser. This keeps feedback truly real-time, keeps hosting costs near zero, and means raw video never leaves the user’s device by default. See `docs/adr-001-architecture.md`.

---

## Project Structure

```
ai-form-corrector/
├── backend/               FastAPI — health, future accounts & sync
├── frontend/              Next.js — camera, MediaPipe, feedback, history
├── docs/                  ADRs and design notes
├── docker-compose.yml     Postgres + backend + frontend
└── .env.example           Required environment variables (template only)
```

---

## Getting Started

**Prerequisites:** Docker Desktop, Node.js 20+, Python 3.12+ (for local non-Docker work).

```bash
cp .env.example .env          # fill in values before first run
docker compose up --build     # starts postgres + backend + frontend
```

Once running:

- Frontend → http://localhost:3000  
- Backend health → http://localhost:8000/api/health  

Open the app, allow camera access, start the camera, then press **Track**. Perform squats in frame. Spoken feedback and rep counting begin automatically. Press **Stop** to save the session.

---

## What’s Built (Phases 1–8)

| Phase | Status | Summary |
|-------|--------|---------|
| **1 — Environment & skeleton** | ✅ | Monorepo, FastAPI health endpoint, Next.js health probe, Docker Compose, ADR for client-side inference |
| **2 — Pose estimation** | ✅ | MediaPipe integration, continuous `requestAnimationFrame` loop, skeleton overlay, visibility confidence, start/stop lifecycle |
| **3 — Squat detection & counting** | ✅ | Knee-angle FSM with hysteresis, dual smoothing (phase vs depth), hip-drop gate, four-tier depth grading, calibrated thresholds |
| **4 — Spoken feedback** | ✅ | Web Speech API, cancel-before-speak, single source of truth for text + audio |
| **5 — Camera guidance** | ✅ | Visibility + torso-size checks, sustained-duration delay + cooldown |
| **6 — Torso lean** | ✅ | Shoulder–hip vertical angle, independent smoothing & per-rep max, “chest up” cue |
| **7 — Session history** | ✅ | `localStorage` persistence of completed sets |
| **8 — Richer data & trends** | ✅ | Per-session breakdown (deep / moderate / shallow), volume & depth-% line charts |

Detailed design notes, bug fixes, and calibration decisions for each phase live in the project roadmap docs.

---

## Tunable Constants (current — squat)

| Constant | Value | Purpose |
|----------|-------|---------|
| `VISIBILITY_THRESHOLD` | 0.5 | Minimum landmark confidence |
| `UP_THRESHOLD` / `DOWN_THRESHOLD` | 165° / 150° | Standing / descending phase cutoffs |
| `PARTIAL_DEPTH_THRESHOLD` | 70° | Moderate attempt floor |
| `GOOD_DEPTH_THRESHOLD` | 50° | Excellent depth ceiling |
| `MIN_HIP_DROP` | 0.05 | Minimum vertical hip travel to count as a real squat |
| `MAX_TORSO_LEAN_DEGREES` | 55° | Chest-up flag (still being refined with real data) |
| `CAMERA_GUIDANCE_DELAY_MS` | 1500 | Framing issue must persist this long before speaking |
| `CAMERA_GUIDANCE_COOLDOWN_MS` | 6000 | Minimum gap between repeated guidance prompts |

---
