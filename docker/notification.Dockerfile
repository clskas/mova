FROM node:22-alpine AS shared-builder
WORKDIR /app/packages/shared
COPY packages/shared/package*.json ./
RUN npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 180000 && npm ci
COPY packages/shared/ ./
RUN npm run build

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY services/notification-service/package*.json ./services/notification-service/
WORKDIR /app/services/notification-service
RUN npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 180000 && npm ci
COPY services/notification-service/ ./
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app/services/notification-service
RUN apk add --no-cache openssl postgresql-client bash
COPY --from=shared-builder /app/packages/shared /app/packages/shared
COPY services/notification-service/package*.json ./
RUN npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 180000 && npm ci --omit=dev
RUN npm config set fetch-retries 5 && npm install prisma@5.22.0 --no-save
COPY --from=builder /app/services/notification-service/dist ./dist
COPY --from=builder /app/services/notification-service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/services/notification-service/prisma ./prisma
COPY scripts/backup-db.sh scripts/migrate-with-backup.sh /app/scripts/
RUN chmod +x /app/scripts/*.sh
ENV NODE_ENV=production MOVA_SERVICE=notifications
EXPOSE 3000
CMD ["sh", "-c", "/app/scripts/migrate-with-backup.sh && node dist/main.js"]
