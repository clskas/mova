FROM node:22-alpine AS shared-builder
WORKDIR /app/packages/shared
COPY packages/shared/package*.json ./
RUN npm ci
COPY packages/shared/ ./
RUN npm run build

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY services/admin-service/package*.json ./services/admin-service/
WORKDIR /app/services/admin-service
RUN npm ci
COPY services/admin-service/ ./
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app/services/admin-service
RUN apk add --no-cache openssl
COPY --from=shared-builder /app/packages/shared /app/packages/shared
COPY services/admin-service/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/admin-service/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
