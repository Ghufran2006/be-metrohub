# Image yang sama dipakai di Railway dan di server lain (Aturan Portabilitas PRD)
FROM node:22-slim

# OpenSSL dibutuhkan Prisma engine
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl default-mysql-client && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

# Migration dijalankan setiap kali container start, lalu server dinyalakan
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
