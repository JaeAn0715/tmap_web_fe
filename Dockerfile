# Vite는 빌드 시점에 VITE_* 환경변수를 번들에 넣습니다.
# fly deploy 시 --build-arg 로 넘기거나 fly.toml [build.args]에 설정하세요.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_TMAP_APP_KEY=""
ARG VITE_API_BASE_URL=""
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_TMAP_APP_KEY=$VITE_TMAP_APP_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
