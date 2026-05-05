FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["dumb-init", "node", "src/app.js"]