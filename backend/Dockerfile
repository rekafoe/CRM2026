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
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer
ENV PUPPETEER_EXECUTABLE_PATH_FILE=/usr/src/app/.chrome-path
ENV npm_config_fetch_timeout=300000

# Puppeteer Chrome + wkhtmltopdf fallback + sqlite3 native install
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  python3 make g++ \
  dbus \
  dbus-x11 \
  wkhtmltopdf \
  fonts-liberation \
  fonts-dejavu-core \
  libasound2 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxkbcommon0 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev \
  && npx puppeteer browsers install chrome \
  && node -e "const fs=require('fs'); const p=require('puppeteer').executablePath(); if(!fs.existsSync(p)) { throw new Error('Chrome not found at '+p) }; fs.writeFileSync('.chrome-path', p); console.log('Chrome:', p);"
COPY --from=builder /usr/src/app/dist ./dist
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS_ON_START:-1}\" = \"1\" ]; then npm run migrate; fi; npm run start"]
