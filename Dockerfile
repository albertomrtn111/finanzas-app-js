# Imagen de producción de NextFinance. Se construye en el servidor con scripts/deploy.sh.

# ---- dependencias ----
FROM node:24-alpine AS deps
WORKDIR /app
# Prisma en Alpine necesita openssl.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

# ---- compilación ----
FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- ejecución ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

# Commit desplegado: lo muestra /api/health para saber qué versión está en marcha.
ARG GIT_COMMIT=desconocido
ENV APP_COMMIT=$GIT_COMMIT
LABEL org.opencontainers.image.revision=$GIT_COMMIT

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
# Esquema y migraciones: el despliegue las aplica con «npx prisma migrate deploy».
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["npm", "run", "start"]
