# Smaran.ai

Smaran.ai is a workspace-based chat app with persistent project memory. It extracts useful facts from conversations, retrieves relevant memories for later replies, and helps resolve conflicting information.

## Features

- Workspace chat with separate sessions.
- Memory on/off control for each workspace.
- Typed memory records such as decisions and assumptions.
- Memory views for all records, records used in a reply, their status, source quote, and activity timeline.
- Semantic memory recall and conflict handling. A newer choice can supersede an older assumption.

## How memory works

When memory is enabled, the server uses Gemini to extract candidate memories and create embeddings for recall. Memories are stored against the current project/workspace. For a later message, relevant records can be included as context for the chat response. The Memory panel shows saved records and, for memories used in the latest reply, their match strength and why they appeared.

The backend uses MongoDB. Configure a MongoDB connection string and a Gemini API key before starting the server.

## Requirements

- Docker Desktop with Docker Compose, or Node.js 20 or later.
- A reachable MongoDB database. The Compose file does not start a MongoDB container; it uses the external database specified by `MONGODB_URI`.
- A Gemini API key in `GEMINI_API_KEYS` for memory embeddings.

# Clone the project

Clone the repository and open the project directory:

```bash
git clone <repository-url>
cd <repository-directory>
```

Replace `<repository-url>` with the Git URL for this project and `<repository-directory>` with the folder created by `git clone`.

## Configure environment

Copy `.env.example` to `.env`, then set at least:

```env
MONGODB_URI=your-mongodb-connection-string
DB_NAME=hindsight
JWT_SECRET=a-random-secret-at-least-32-characters-long
GEMINI_API_KEYS=your-gemini-api-key
```

`JWT_SECRET` must be at least 32 characters. For MongoDB Atlas, ensure the cluster is running, the database user has access, and the machine's IP address is allowed by the Atlas network access list. `APP_URL_DOCKER` sets the URL used to create invite links in Docker; set it to your public app URL when hosting remotely. Never commit `.env` or put API keys in frontend code.

## Start with Docker Compose

Run these commands from the project directory:

```powershell
docker compose config --quiet
$env:HOST_PORT = "3003"
docker compose up --build -d
docker compose ps
docker compose logs -f smaran-ai
```

Open [http://localhost:3003](http://localhost:3003). Check the database-backed health endpoint with:

```powershell
curl.exe http://localhost:3003/api/health
```

Stop the app with `docker compose down`. The database is external, so this does not delete MongoDB data.

The app listens on port 3001 inside the container and is published on host port 3003. If 3003 is already in use, choose another free port:

```powershell
$env:HOST_PORT = "3004"
docker compose up --build -d
```

Then open [http://localhost:3004](http://localhost:3004). To clear the override in the same PowerShell window, run `Remove-Item Env:HOST_PORT`.

## Run for local development

Open two PowerShell terminals in the project directory. Install both dependency sets once:

```powershell
npm ci
npm --prefix web ci
```

In terminal 1, start the API:

```powershell
npm run dev
```

In terminal 2, start the Vite frontend:

```powershell
npm run dev:web
```

Open [http://localhost:5173](http://localhost:5173). The API listens on port 3001. Ensure `.env` has valid database and Gemini settings before starting.

## Useful commands

| Command | Purpose |
| --- | --- |
| `docker compose config --quiet` | Validate the Compose file and variable interpolation. |
| `docker compose up --build -d` | Build and start the container in the background. |
| `docker compose logs -f smaran-ai` | Follow application logs. |
| `docker compose ps` | Show container and health status. |
| `docker compose down` | Stop and remove the container and network. |
| `npm run setup` | Set up MongoDB collections and the vector search index. |
| `npm run migrate:team` | Migrate legacy single-user memories to team projects. |
| `npm run seed` | Seed demo memories. |
| `npm run smoke` | Run a vector search smoke check. |
| `npm run build:web` | Build the production frontend. |

## Troubleshooting

- Docker publishes on host port 3003 by default; if that port is occupied, use another free `HOST_PORT` such as 3004.
- If `/api/health` returns 503, check MongoDB connectivity, credentials, Atlas network access, and the database name.
- If memory extraction or recall fails with Gemini 401 errors, replace `GEMINI_API_KEYS` with a valid Gemini API key, then recreate/restart the container.
- If the container reports `exec ./docker-entrypoint.sh: no such file or directory`, make sure shell scripts use LF line endings, then rebuild with `docker compose up --build -d`. `.gitattributes` now enforces LF for `.sh` files.

