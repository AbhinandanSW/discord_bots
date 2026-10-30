# One image, either bot. Set BOT=jobs or BOT=dsa (or override the command).
FROM node:24-slim

ENV NODE_ENV=production \
    DATA_DIR=/data \
    BOT=jobs

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Mount your persistent volume here. Running as root keeps mounted volumes
# writable on every host (Fly, Railway, Northflank all differ in ownership).
RUN mkdir -p /data

EXPOSE 8080
CMD ["node", "src/start.js"]
