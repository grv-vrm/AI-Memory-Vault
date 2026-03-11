# AI Memory Vault

AI Memory Vault is a full-stack personal second-brain app:
- Frontend: React + Vite + TypeScript
- Backend: Bun + Express + Prisma
- Worker: BullMQ ingestion worker
- Storage/AI integrations: Supabase, Pinecone, Hugging Face, Neo4j

This guide is for a new user to run the project from scratch.

## 1. Prerequisites

Install these first:
- Bun (latest)
- Node.js 20+ (needed by some tooling)
- Redis (running on `127.0.0.1:6379`)
- Access to:
  - PostgreSQL (or Prisma Accelerate URL)
  - Supabase project + storage bucket
  - Pinecone index
  - Hugging Face API key
  - Google OAuth credentials
  - Neo4j database (optional but recommended)

## 2. Clone and Install

```bash
git clone <your-repo-url>
cd AI-memory-vault-main

cd backend
bun install

cd ../frontend
bun install

cd ..
```

## 3. Environment Setup

### Backend env

```bash
cd backend
copy .env.example .env
```

Fill `backend/.env` with your real values:
- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`, `JWT_SECRET`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `S3_BUCKET`
- `REDIS_URL`
- `HF_API_KEY`, `HF_EMBEDDING_MODEL`
- `PINECONE_API_KEY`, `PINECONE_ENVIRONMENT`, `PINECONE_INDEX`
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`

Recommended LLM fallback list:
```env
HF_LLM_MODELS="mistralai/Mistral-7B-Instruct-v0.3,Qwen/Qwen2.5-7B-Instruct,google/flan-t5-large"
```

### Frontend env

```bash
cd ../frontend
copy .env.example .env
```

Set at least:
```env
VITE_API_URL="http://localhost:5000"
```

Then go back to root:
```bash
cd ..
```

## 4. Prisma (Required before running backend)

Run from `backend`:

```bash
cd backend
bunx prisma generate
bunx prisma migrate deploy
cd ..
```

If you are in local development and want a new migration:
```bash
cd backend
bunx prisma migrate dev --name init_local
cd ..
```

## 5. Start Redis

Make sure Redis is running on:
- `redis://127.0.0.1:6379`

## 6. Run the project

### Option A (one command, Windows)

From project root:
```bash
.\start-dev.bat
```

This starts:
- Backend API: `http://localhost:5000`
- Worker: BullMQ file processor
- Frontend: `http://localhost:5173`

### Option B (manual, 3 terminals)

Terminal 1:
```bash
cd backend
bun run dev:api
```

Terminal 2:
```bash
cd backend
bun run dev:worker
```

Terminal 3:
```bash
cd frontend
bun run dev
```

## 7. Verify it works

1. Open `http://localhost:5173`
2. Login/register
3. Upload a text/PDF file
4. Wait for worker logs to show processing complete
5. Ask a question on Memory Search page

## 8. Useful commands

Backend tests:
```bash
cd backend
bun test
```

Backend typecheck:
```bash
cd backend
bunx tsc --noEmit
```

Frontend typecheck:
```bash
cd frontend
bunx tsc --noEmit
```

Open Prisma DB UI:
```bash
cd backend
bunx prisma studio
```

## 9. Notes

- Chat memory is persisted with retention options of `24h` or `48h` (no forever mode).
- If backend fails after schema changes, run Prisma commands again:
  - `bunx prisma generate`
  - `bunx prisma migrate deploy`
