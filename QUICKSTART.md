# Smaran.ai — Quick Start Guide

Smaran.ai keeps the decisions, assumptions, and context behind your project close at hand. It includes a celestial design system (dark/light themes), multi-author team collaboration, and real-time memory syncing over Server-Sent Events (SSE).

---

## 📋 Prerequisites

Before running the project, make sure you have:
1. **Docker Desktop** (if using Docker) or **Node.js 20+** / **Bun**.
2. **MongoDB Atlas URI** (with vector search enabled for semantic retrieval).
3. **At least one AI Provider API Key**:
   - Google Gemini API key (`GEMINI_API_KEYS`), or
   - Groq API key (`GROQ_API_KEYS`), or
   - OpenRouter API key (`OPENROUTER_API_KEYS`).

---

## ⚙️ Environment Setup

A ready-to-run `.env` file is already included in the repository.
If you wish to use your own MongoDB Atlas cluster or custom AI API keys, simply edit `.env`:

```env
# Database Connection
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>
DB_NAME=smaran

# Security & Auth
JWT_SECRET=your-random-secret-key-at-least-32-characters-long
DEMO_PASSWORD=your-secure-demo-password

# AI Provider Keys (at least one is required)
GEMINI_API_KEYS=your-gemini-api-key
GROQ_API_KEYS=
OPENROUTER_API_KEYS=

# App Settings
PORT=3001
APP_URL=http://localhost:3001
```

---

## 🐳 Option 1: Automatic Run with Docker (Recommended)

Docker automatically builds the frontend web bundle and starts the unified production server on port `3001`.

### Using Docker Compose:
```bash
docker compose up --build
```

### Or Using Standard Docker CLI:
```bash
# 1. Build the image
docker build -t smaran-ai .

# 2. Run the container
docker run -d \
  --name smaran-ai-app \
  -p 3001:3001 \
  --env-file .env \
  smaran-ai
```

### Accessing the App:
Once started, open:
👉 **[http://localhost:3001](http://localhost:3001)**

---

## 💻 Option 2: Local Development (Without Docker)

If you prefer developing locally:

### 1. Install Dependencies
```bash
# Root & backend dependencies
npm install

# Frontend web dependencies
npm --prefix web install
```

### 2. Run Database Migration (First Time)
```bash
npm run migrate:team
```

### 3. Start Development Servers
Open two terminal windows:

- **Terminal 1: Backend API**
  ```bash
  npm run dev
  # or
  bun run dev
  ```

- **Terminal 2: Frontend Web UI**
  ```bash
  npm run dev:web
  ```

👉 Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🛠️ Handy Management Scripts

| Command | Description |
| :--- | :--- |
| `npm run setup` | Creates MongoDB collections and ensures Atlas Vector Search index is active. |
| `npm run migrate:team` | Migrates legacy single-user memories to multi-author team projects. |
| `npm run seed` | Seeds initial project decisions and assumptions for testing. |
| `npm run smoke` | Runs automated smoke check verifying vector search similarity. |
| `npm run demo:reset` | Resets the database to a fresh initial demo state. |
| `npm run build:web` | Compiles the production frontend bundle to `web/dist`. |

---

## 🌟 Key Features

- **Celestial Design**: Fluid glowing sphere with blurred depth of field and high-contrast light/dark mode toggle.
- **Team Mode**: Multi-project switcher, invite links, role management (owner/member), and live activity feed.
- **Real-Time Memory**: Live Server-Sent Events (SSE) sync memories as team members collaborate.
- **Self-Contained Deployment**: Express server hosts both the API and the compiled React SPA from a single port.
