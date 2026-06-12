FROM node:22-alpine AS shared-builder
WORKDIR /app/packages/shared
COPY packages/shared/package*.json ./
RUN npm ci
COPY packages/shared/ ./
RUN npm run build

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY services/notification-service/package*.json ./services/notification-service/
WORKDIR /app/services/notification-service
RUN npm ci
COPY services/notification-service/ ./
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app/services/notification-service
RUN apk add --no-cache openssl
COPY --from=shared-builder /app/packages/shared /app/packages/shared
COPY services/notification-service/package*.json ./
RUN npm ci --omit=dev
RUN npm install prisma@5.22.0 --no-save
COPY --from=builder /app/services/notification-service/dist ./dist
COPY --from=builder /app/services/notification-service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/services/notification-service/prisma ./prisma
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
