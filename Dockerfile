FROM node:22-bookworm-slim

# ffmpeg is required at runtime; build tools let better-sqlite3 compile if no
# prebuilt binary matches. Fonts dir is read by the libass burn-in.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 make g++ fontconfig ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
VOLUME /app/data

# Apply the schema (creates/updates ./data/app.db), then serve.
CMD ["sh", "-c", "npx drizzle-kit push --force && npm run start"]
