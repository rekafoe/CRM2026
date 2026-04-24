FROM node:20-bookworm-slim AS builder
WORKDIR /usr/src/app
ENV PUPPETEER_SKIP_DOWNLOAD=true
# prebuild-install (sqlite3): в CI иногда таймаут загрузки бинарника
ENV npm_config_fetch_timeout=300000
# sqlite3: при сбое prebuild нужен node-gyp → Python + toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV npm_config_fetch_timeout=300000

# deps for puppeteer/chromium runtime + sqlite3 native install (npm ci --omit=dev)
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  python3 make g++ \
  chromium \
  fonts-liberation \
  libasound2 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcairo2 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /usr/src/app/dist ./dist
COPY public ./public
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS_ON_START:-1}\" = \"1\" ]; then npm run migrate; fi; npm run start"]
