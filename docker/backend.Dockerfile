# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache openssl postgresql-client bash
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY scripts/backup-db.sh scripts/migrate-with-backup.sh /app/scripts/
RUN chmod +x /app/scripts/*.sh
ENV NODE_ENV=production MOVA_SERVICE=auth
EXPOSE 3000
# Legacy monolith image — still enforce backup-before-migrate when used.
CMD ["sh", "-c", "/app/scripts/migrate-with-backup.sh && node dist/main.js"]
