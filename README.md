# 1-Desk Community

Open-source, self-hosted helpdesk that connects a **Telegram bot** to a **[Dify](https://dify.ai) AI app**, with a real-time operator dashboard for human handoff.

This is the free **Community Edition**: Telegram in, Dify AI out, operators in the middle. No paid plans, no usage limits, no external dependencies beyond PostgreSQL and Redis.

## Features

- **Telegram channel** — connect a bot via @BotFather; the webhook is registered automatically.
- **Dify AI brain** — incoming messages are streamed to your Dify app and the reply is sent back to the user.
- **Operator dashboard** (React SPA) — live conversations over WebSocket, contacts, inboxes, bots, basic analytics.
- **Auth** — email + password with optional **TOTP two-factor** (authenticator app + recovery codes).
- **Multi-operator** — admins create operator accounts; conversations can be assigned and answered by humans.

## Architecture

| Part | Stack |
|------|-------|
| `backend/` | Node.js / Express, Prisma ORM (PostgreSQL), Socket.IO, Redis adapter |
| `frontend/` | React 18 + Vite operator dashboard |

Message flow:

```
Telegram user -> /api/webhooks/telegram/:inboxId -> ingest -> Dify app -> reply -> Telegram
                                                       \-> live mirror to operators via Socket.IO
```

## Quick start (Docker)

```bash
cp .env.example .env          # then edit secrets (JWT, admin user)
docker compose up --build
```

- Backend API: http://localhost:4000
- Operator dashboard: http://localhost:3001
- First boot seeds an admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` and a starter Telegram inbox.

## Manual setup

```bash
# Backend
cd backend
npm install
npm run dev        # runs prisma generate + db push, then starts the server

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Requires PostgreSQL and Redis running (see `docker-compose.yml` for defaults).

## Configuration

All config is via environment variables — see [`.env.example`](.env.example). Key ones:

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Auth token signing (use 64-char random hex) |
| `INTEGRATION_ENC_KEY` | Encrypts Dify credentials at rest (falls back to `JWT_SECRET`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seed admin account |

**Never commit real secrets.** `.env` is gitignored.

## Connecting Telegram + Dify

1. Sign in to the dashboard as admin.
2. **Integrations** → add your Dify app: API URL (`https://your-dify/v1/chat-messages`) + API key.
3. **Channels** → open the Telegram inbox, paste your bot token from @BotFather, save. The webhook registers automatically.
4. Message your bot on Telegram; replies come from Dify and stream into the operator dashboard.

> Telegram webhooks require a public HTTPS URL. For local testing use a tunnel (e.g. ngrok) and set `BASE_URL` accordingly.

## License

Community Edition — free to self-host. See repository for license details.
