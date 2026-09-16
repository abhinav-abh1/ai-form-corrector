# AI Form Corrector

Real-time, on-device workout form analysis with spoken corrective feedback, rep counting, and progress tracking.

## Project Structure

```
ai-form-corrector/
├── backend/          FastAPI service — accounts, session/history sync, PostgreSQL
├── frontend/          Web client — camera capture, on-device pose inference, live feedback, TTS
├── docs/              Architecture notes and decisions (ADRs)
├── docker-compose.yml Local multi-service orchestration
└── .env.example       Template for required environment variables
```

Why split this way: the frontend does all real-time ML inference and audio feedback locally in the
browser (latency matters — video never leaves the device). The backend only handles things that
genuinely need a server: user accounts and long-term history sync. Keeping these as separate
services means either one can be developed, tested, and deployed independently.

## Local Development

Prerequisites: Docker Desktop, Node.js 20+, Python 3.12+.

```bash
cp .env.example .env        # fill in real values before running
docker compose up --build   # starts postgres + backend + frontend
```

Once running:
- Backend health check: http://localhost:8000/api/health
- Frontend: http://localhost:3000

## Status

Phase 1 (this commit): repository, environment, and deployment skeleton — a "walking skeleton"
that proves frontend, backend, and database can all start and talk to each other, before any
real ML logic is written. See `docs/`.

## License

TBD
