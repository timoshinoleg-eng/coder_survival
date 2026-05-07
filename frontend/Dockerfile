FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/index.html frontend/vite.config.js ./
COPY frontend/src/ ./src/
RUN npm run build

FROM nginx:alpine
COPY nginx/codersurvival.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
