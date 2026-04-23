# Статическая витрина (Vite): зависимости нужны в backend/ и frontend/, не только в корне.
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci \
  && (cd backend && npm ci) \
  && (cd frontend && npm ci)
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
RUN npm install -g serve
# Vite по умолчанию: frontend/dist
COPY --from=builder /usr/src/app/frontend/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
