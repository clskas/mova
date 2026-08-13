FROM node:22-alpine AS shared-builder
WORKDIR /app/packages/shared
COPY packages/shared/package.json ./
RUN npm install
COPY packages/shared/ ./
RUN npm run build

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=shared-builder /app/packages/shared ./packages/shared
COPY services/sms-hub-service/package.json ./services/sms-hub-service/
WORKDIR /app/services/sms-hub-service
RUN npm install
COPY services/sms-hub-service/ ./
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app/services/sms-hub-service
RUN apk add --no-cache wget
COPY --from=shared-builder /app/packages/shared /app/packages/shared
COPY services/sms-hub-service/package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/services/sms-hub-service/dist ./dist
ENV NODE_ENV=production MOVA_SERVICE=sms-hub PORT=3001
EXPOSE 3001
CMD ["node", "dist/main.js"]
