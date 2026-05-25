FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache \
    cairo-dev \
    giflib-dev \
    jpeg-dev \
    make \
    pango-dev \
    pixman-dev \
    python3 \
    g++
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache cairo giflib libjpeg-turbo pango pixman dumb-init
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY package.json ./
RUN chown -R node:node /app
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["dumb-init", "node", "src/index.js"]
