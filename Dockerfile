# Vite는 빌드 시점에 VITE_* 를 번들에 넣습니다.
# - API 베이스: 저장소의 `.env.production`(Docker 컨텍스트에 포함됨).
# - TMAP / Google: `fly deploy --build-arg ...` 로 주입(비밀은 커밋하지 않음).
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_TMAP_APP_KEY=""
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_TMAP_APP_KEY=$VITE_TMAP_APP_KEY
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
