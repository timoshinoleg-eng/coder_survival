FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY index.js ./
ENV NODE_ENV=production
USER node
CMD ["dumb-init", "node", "index.js"]

