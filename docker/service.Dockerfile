# Reusable microservice Dockerfile — set SERVICE_NAME build arg
ARG SERVICE_NAME
FROM node:22-alpine AS shared-builder
WORKDIR /app/packages/shared
COPY packages/shared/package*.json ./
RUN npm ci
COPY packages/shared/ ./
RUN npm run build

FROM node:22-alpine AS builder
ARG SERVICE_NAME
WORKDIR /app
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY services/${SERVICE_NAME}/package*.json ./services/${SERVICE_NAME}/
WORKDIR /app/services/${SERVICE_NAME}
RUN npm ci
COPY services/${SERVICE_NAME}/ ./
RUN if [ -d prisma ]; then npx prisma generate; fi
RUN npm run build

FROM node:22-alpine AS production
ARG SERVICE_NAME
WORKDIR /app/services/${SERVICE_NAME}
RUN apk add --no-cache openssl postgresql-client
COPY --from=shared-builder /app/packages/shared /app/packages/shared
COPY services/${SERVICE_NAME}/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/${SERVICE_NAME}/dist ./dist
RUN if [ -d /app/services/${SERVICE_NAME}/prisma ]; then true; fi
COPY --from=builder /app/services/${SERVICE_NAME}/node_modules/.prisma ./node_modules/.prisma 2>/dev/null || true
COPY --from=builder /app/services/${SERVICE_NAME}/prisma ./prisma 2>/dev/null || true
COPY scripts/backup-db.sh scripts/migrate-with-backup.sh /app/scripts/
RUN chmod +x /app/scripts/backup-db.sh /app/scripts/migrate-with-backup.sh
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "if [ -f prisma/schema.prisma ]; then /app/scripts/migrate-with-backup.sh; fi && node dist/main.js"]
