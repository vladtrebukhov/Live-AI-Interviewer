## Live-Interviewer

Live-Interviewer is a browser-based app that simulates a live coding interview with real-time AI feedback. Users select a Low-Level Design question, write code in a Monaco editor, speak their thought process aloud, and receive feedback from an AI interviewer powered by Azure OpenAI.

The interviewer listens via browser speech recognition, evaluates your code and communication in real time, and responds with typed feedback (hints, clarifications, confirmations, follow-ups). You can run code and tests directly in the browser without any server-side execution.

## Architecture at a Glance

The system is a pnpm monorepo with three packages:

| Package    | Role                                                       |
|------------|------------------------------------------------------------|
| `shared`   | Domain types, WebSocket message schemas, language registry |
| `backend`  | Fastify API server, database, AI services                  |
| `frontend` | Next.js web app, code editor, speech recognition           |

The frontend communicates with the backend over REST (CRUD for questions and sessions) and a single WebSocket connection per interview (code updates, speech transcripts, AI feedback, TTS audio).

Code execution runs entirely in the browser via a WASM-based Node.js runtime (NodePod). Speech-to-text runs client-side using Azure Speech SDK with server-issued tokens. Text-to-speech runs server-side via Azure OpenAI and is delivered over WebSocket.

For detailed architectural decisions, data flow, and design rationale, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Tech Stack

| Layer          | Technology                                                       |
|----------------|------------------------------------------------------------------|
| Frontend       | Next.js 16, React 19, Tailwind CSS 4, Monaco Editor, Zustand 5  |
| Backend        | Fastify 5, WebSocket (`@fastify/websocket`)                     |
| Database       | PostgreSQL 16, Prisma 7 (driver adapter)                        |
| AI (LLM)      | Azure OpenAI GPT-4o (non-streaming, JSON structured output)     |
| AI (TTS)      | Azure OpenAI TTS (opus format, server-side)                     |
| AI (STT)      | Azure Cognitive Services Speech SDK (browser-side, token auth)   |
| Code Execution | In-browser via NodePod (WASM)                                   |
| Testing        | Vitest (unit), Playwright (E2E)                                  |
| CI             | GitHub Actions (lint → format → typecheck → test → build)       |

## Project Structure

```text
live-interview/
├── packages/
│   ├── shared/            # TypeScript types and constants
│   ├── backend/
│   │   ├── prisma/        # Schema, migrations, seed
│   │   └── src/
│   │       ├── routes/    # REST + WebSocket endpoints
│   │       ├── services/  # LLM and TTS integrations
│   │       └── lib/       # Prisma client, env loader
│   └── frontend/
│       └── src/
│           ├── app/       # Pages (home, dashboard, interview)
│           ├── hooks/     # Speech recognition, WebSocket
│           ├── stores/    # Zustand state
│           └── lib/       # API client, code execution
├── docker-compose.yml     # PostgreSQL 16
├── ARCHITECTURE.md        # Detailed architecture and decisions
└── .github/workflows/     # CI pipeline
```

## Prerequisites

* Node.js >= 20 ([download](https://nodejs.org/))
* pnpm >= 9, install with `corepack enable` (bundled with Node 20+)
* Docker, for running PostgreSQL ([download Docker Desktop](https://www.docker.com/products/docker-desktop/))
* Azure OpenAI account with deployed models (GPT-4o, TTS)
* Azure Cognitive Services Speech resource (for browser STT tokens)

## Getting Started

### 1. Clone and install dependencies

```bash
git clone https://github.com/vladtrebukhov/Live-AI-Interviewer.git
cd Live-AI-Interviewer
pnpm install
```

### 2. Start PostgreSQL

The easiest way is with Docker:

```bash
docker compose up -d
```

This starts a PostgreSQL 16 instance on `localhost:5432` with:
- **User:** `postgres`
- **Password:** `postgres`
- **Database:** `live_interviewer`

To verify it's running:
```bash
docker compose ps
```

You should see `live-interviewer-db` with status `Up`.

To stop it later:
```bash
docker compose down
```

To stop AND delete all data:
```bash
docker compose down -v
```

<details>
<summary><strong>Alternative: Install PostgreSQL without Docker</strong></summary>

**macOS (Homebrew):**
```bash
brew install postgresql@16
brew services start postgresql@16
createdb live_interviewer
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb live_interviewer
```

**Windows:**
Download from https://www.postgresql.org/download/windows/ and run the installer. Use pgAdmin or `psql` to create the `live_interviewer` database.

If you use a custom user/password/port, update `DATABASE_URL` in your `.env` accordingly.
</details>

### 3. Configure environment variables

Copy the shared example file into the repository root:

```bash
cp .env.example .env
```

Edit `.env` and fill in the values you need.

### Backend Variables

| Variable                       | Required | Description                                                    |
|--------------------------------|----------|----------------------------------------------------------------|
| `DATABASE_URL`                 | Yes      | PostgreSQL connection string (pre-set for Docker default)      |
| `AZURE_OPENAI_ENDPOINT`       | Yes      | Azure Portal → your OpenAI resource → Keys and Endpoint       |
| `AZURE_OPENAI_API_KEY`        | Yes      | Same page as endpoint                                          |
| `AZURE_OPENAI_API_VERSION`    | No       | Defaults to `2024-12-01-preview`                               |
| `AZURE_OPENAI_LLM_DEPLOYMENT` | Yes      | Azure AI Foundry → Deployments → your GPT-4o deployment name  |
| `AZURE_OPENAI_TTS_DEPLOYMENT` | Yes      | Your TTS deployment name                                       |
| `AZURE_OPENAI_TTS_ENDPOINT`   | No       | TTS resource endpoint if TTS runs on a different resource      |
| `AZURE_OPENAI_TTS_API_KEY`    | No       | TTS resource key if different from `AZURE_OPENAI_API_KEY`      |
| `AZURE_OPENAI_TTS_API_VERSION`| No       | Defaults to `AZURE_OPENAI_API_VERSION` when omitted            |
| `AZURE_SPEECH_KEY`            | Yes      | Azure Speech resource key for browser STT token issuance       |
| `AZURE_SPEECH_REGION`         | Yes      | Azure Speech region (e.g., `eastus`)                           |
| `AZURE_SPEECH_ENDPOINT`       | No       | Custom Speech endpoint when required by your resource          |
| `FRONTEND_URL`                | No       | Defaults to `http://localhost:3000` (CORS and origin checks)   |
| `PORT`                        | No       | Backend port, defaults to `3001`                               |
| `HOST`                        | No       | Backend host, defaults to `0.0.0.0`                            |

### Frontend Variables

| Variable                     | Required | Description                                        |
|------------------------------|----------|----------------------------------------------------|
| `NEXT_PUBLIC_API_URL`        | No       | Backend URL (default: `http://localhost:3001`)      |
| `NEXT_PUBLIC_WS_URL`         | No       | Backend WebSocket URL (default: `ws://localhost:3001`) |
| `NEXT_PUBLIC_SPEECH_LOCALE`  | No       | Speech locale override (default: `en-US`)          |

The root `.env` is the primary source of truth for local development. The backend also honors `packages/backend/.env` as an override, but you do not need a package-local env file for the standard setup.

### 4. Run database migrations

This creates all the tables in PostgreSQL:

```bash
pnpm db:migrate
```

You'll be prompted to name the migration — type something like `init` and press Enter.

### 5. Seed the database

This populates 8 LLD interview questions:

```bash
pnpm db:seed
```

### 6. Start development servers

```bash
pnpm dev
```

This starts both servers in parallel:
- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:3001

Verify the backend is running:
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"..."}
```

### 7. Open the app

Visit http://localhost:3000 in your browser. Go to the dashboard and select a question to start an interview session.

## Available Scripts

Run from the repo root:

| Script            | Description                                         |
|-------------------|-----------------------------------------------------|
| `pnpm dev`        | Start all packages in dev mode (frontend + backend) |
| `pnpm build`      | Build all packages for production                   |
| `pnpm test`       | Run all unit tests (Vitest)                         |
| `pnpm test:e2e`   | Run E2E tests (Playwright, requires running app)    |
| `pnpm lint`       | Run ESLint across the workspace                     |
| `pnpm format`     | Check code formatting (Prettier)                    |
| `pnpm format:fix` | Auto-fix formatting                                 |
| `pnpm typecheck`  | Run TypeScript type checking                        |
| `pnpm db:migrate` | Run Prisma database migrations                      |
| `pnpm db:seed`    | Seed the database with sample questions             |

## How It Works

1. Go to the dashboard and select one of 8 Low-Level Design questions.
2. Write code in the Monaco editor (TypeScript or JavaScript).
3. Speak your thought process. Audio is captured via the browser's microphone, and speech recognition runs client-side using short-lived Azure Speech tokens issued by the backend.
4. Request AI feedback. GPT-4o acts as a technical interviewer, providing hints, clarifications, and critiques based on your code and what you said.
5. Run code and tests directly in the browser via NodePod (WASM-based Node.js runtime).
6. Listen to feedback. AI responses are converted to speech via Azure OpenAI TTS and played back through the WebSocket connection.

For deeper detail on the WebSocket protocol, speech architecture, database schema, and all design decisions, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Troubleshooting

### PostgreSQL won't start

```bash
# Check if Docker is running
docker info

# Check container logs
docker compose logs postgres

# Check if port 5432 is already in use
lsof -i :5432
```

### Migration fails

```bash
# Make sure Postgres is running and DATABASE_URL is correct
docker compose ps

# Reset the database (WARNING: deletes all data)
cd packages/backend && npx prisma migrate reset
```

### Backend won't start

```bash
# Check if port 3001 is in use
lsof -i :3001

# Verify .env exists and has values
cat .env
```

### Azure OpenAI errors

The app uses Azure OpenAI, not direct OpenAI. Verify your `.env` has `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY` set (not `OPENAI_API_KEY`).

## License

MIT

