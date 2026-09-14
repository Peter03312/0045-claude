# syntax=docker/dockerfile:1

# ---- 依赖层：web 构建与 verify 共用 ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 生产构建 ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- 静态 web：仅 nginx 托管 dist ----
FROM nginx:alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# ---- 一次性 verify：单元测试 + 生产构建 + 端到端测试 ----
# 基于 Debian 以便 Playwright 安装 Chromium 系统依赖
FROM node:20-bookworm AS verify
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci \
  && npx playwright install --with-deps chromium
COPY . .
CMD ["sh", "-c", "npm run test:run && npm run build && npm run test:e2e"]
