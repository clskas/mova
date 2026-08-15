FROM node:22-alpine AS builder
WORKDIR /app
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
ARG NEXT_PUBLIC_API_URL=https://mova-gateway.onrender.com
ARG NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ARG NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
# Render / Docker proxy: bind all interfaces (default localhost → HTTP 502).
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
