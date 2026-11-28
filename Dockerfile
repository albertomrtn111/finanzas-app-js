# Imagen de producción de NextFinance. Se construye en el servidor con scripts/deploy.sh.

# ---- dependencias ----
FROM node:24-alpine AS deps
WORKDIR /app
# El motor de migraciones de Prisma (schema-engine) necesita openssl en Alpine.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

# ---- compilación ----
FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Genera el cliente de Prisma en src/generated/prisma (Next.js lo incluye en .next) y se asegura
# de que el motor de migraciones está en node_modules: si falta, falla aquí y no al migrar.
RUN npx prisma generate && ls node_modules/@prisma/engines/schema-engine-* > /dev/null
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
# Esquema, migraciones y configuración de la CLI de Prisma: el despliegue aplica las migraciones
# con «npx prisma migrate deploy», que lee DATABASE_URL del .env del compose.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.mjs ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["npm", "run", "start"]
