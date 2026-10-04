# Deploying on a Contabo VPS

Needs a VPS with ≥4 GB RAM (ffmpeg renders are CPU/RAM hungry), Ubuntu 22.04+,
and a domain whose A record points at the VPS IP.

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. Firewall
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# 3. App
git clone https://github.com/areeb26/Caption-tool.git && cd Caption-tool
cp .env.example .env
nano .env     # see below
docker compose up -d --build
```

Required `.env` values:

- `DOMAIN=captions.example.com` (used by Caddy for HTTPS)
- `NEXTAUTH_URL=https://captions.example.com`
- `NEXTAUTH_SECRET=` (run `openssl rand -base64 32`)
- `OPENAI_API_KEY=` (Whisper + Roman Urdu transliteration)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (or `EMAIL_SERVER`/`EMAIL_FROM`).
  Production disables the dev-user fallback, so one sign-in method is required.
  Google redirect URI: `https://<DOMAIN>/api/auth/callback/google`

Data (SQLite DB, uploads, renders) lives in `./data` on the VPS. Back it up.
Leave `S3_*` empty to store files there, or fill them in to use R2/S3.

Update: `git pull && docker compose up -d --build`
Logs: `docker compose logs -f app`

Nightly cleanup of old files (7-day retention):

```
0 3 * * * cd /root/Caption-tool && docker compose exec -T app npm run retention
```
