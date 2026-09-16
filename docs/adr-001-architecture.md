# ADR 001: Client-Side Inference, Thin Backend

**Status:** Accepted

## Context

The app needs real-time pose estimation and spoken feedback while someone is mid-exercise.
Two architectures were considered: (a) stream camera frames to the backend and run inference
server-side, or (b) run pose inference in the browser and keep the backend for accounts/history
only.

## Decision

Pose inference runs client-side (in-browser, via a pretrained model). The FastAPI backend
handles only accounts and long-term history sync.

## Reasoning

- Server-side video streaming adds encode/network/decode latency that breaks the "real-time"
  requirement outright.
- Server-side inference means paying for GPU/CPU-heavy compute per concurrent user — expensive
  and unnecessary for a single-user-at-a-time experience.
- Client-side inference means raw video never leaves the device by default, which is a real
  privacy advantage and reduces the DPDP-Act data-handling burden significantly.

## Consequences

- The backend can be genuinely small and cheap to run/host.
- Feature-detection/model-loading complexity moves to the frontend.
- Any future feature that needs the raw video server-side (not currently planned) would need
  its own explicit design and consent flow.
