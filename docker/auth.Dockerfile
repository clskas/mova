FROM node:22-alpine AS shared-builder
WORKDIR /app/packages/shared
COPY packages/shared/package*.json ./
RUN npm ci
COPY packages/shared/ ./
RUN npm run build

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY services/auth-service/package*.json ./services/auth-service/
WORKDIR /app/services/auth-service
RUN npm ci
COPY services/auth-service/ ./
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app/services/auth-service
RUN apk add --no-cache openssl postgresql-client bash
COPY --from=shared-builder /app/packages/shared /app/packages/shared
COPY services/auth-service/package*.json ./
RUN npm ci --omit=dev
RUN npm install prisma@5.22.0 --no-save
COPY --from=builder /app/services/auth-service/dist ./dist
COPY --from=builder /app/services/auth-service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/services/auth-service/prisma ./prisma
COPY scripts/backup-db.sh scripts/migrate-with-backup.sh /app/scripts/
RUN chmod +x /app/scripts/*.sh
ENV NODE_ENV=production MOVA_SERVICE=auth
EXPOSE 3000
CMD ["sh", "-c", "/app/scripts/migrate-with-backup.sh && node dist/main.js"]
