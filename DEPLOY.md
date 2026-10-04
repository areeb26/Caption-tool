# Deploying on a Contabo VPS

Needs a VPS with ≥4 GB RAM (ffmpeg renders are CPU/RAM hungry) and Ubuntu 22.04+.
No domain required: we use a free `sslip.io` hostname that points at your IP.

## 1. Pick your hostname

If your VPS IP is `203.0.113.5`, your address is **`203-0-113-5.sslip.io`**
(dots become dashes). Caddy gets a real HTTPS certificate for it automatically.
If you later buy a domain, just swap it into `DOMAIN` / `NEXTAUTH_URL`.

## 2. Install

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# Firewall
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# App
git clone https://github.com/areeb26/Caption-tool.git && cd Caption-tool
git checkout claude/charming-gates-vgfsgk   # until merged to main
cp .env.example .env
nano .env     # see below
docker compose up -d --build
```

## 3. `.env` values

```
DOMAIN=203-0-113-5.sslip.io
NEXTAUTH_URL=https://203-0-113-5.sslip.io
NEXTAUTH_SECRET=<output of: openssl rand -base64 32>
OPENAI_API_KEY=sk-...          # Whisper transcription
GEMINI_API_KEY=                # optional: Gemini does the Roman Urdu transliteration
ADMIN_USERNAME=youradmin
ADMIN_PASSWORD=a-long-password
```

Leave `S3_*`, `GOOGLE_*` and `EMAIL_*` empty. Files are stored in `./data` on the
VPS (SQLite DB, uploads, renders), so back that folder up.

## 4. Sign in and add users

Open `https://203-0-113-5.sslip.io`, sign in with `ADMIN_USERNAME` /
`ADMIN_PASSWORD`, then click **Users** on the dashboard (or go to `/admin`) to
create accounts with a username and password, reset passwords, disable or
delete users. Give each person their username and password.

If you forget the admin password, change `ADMIN_PASSWORD` in `.env` and run
`docker compose up -d`; the next admin login resets it.

## Operations

- Update: `git pull && docker compose up -d --build`
- Logs: `docker compose logs -f app`
- Nightly cleanup of old files (7-day retention), via `crontab -e`:

```
0 3 * * * cd /root/Caption-tool && docker compose exec -T app npm run retention
```
