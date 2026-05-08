FROM node:20-alpine AS builder

ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app
COPY package*.json ./
# Use npm install (not npm ci) — the lockfile is Windows-generated so
# platform-specific optional deps (esbuild binaries) differ on Linux.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
