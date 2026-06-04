FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libgif7 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpixman-1-0 \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*
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
