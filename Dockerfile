# BookStudio en un unico contenedor: la API sirve tambien el frontend compilado.
# Pensado para Coolify: no hace falta proxy delante ni un segundo servicio web.

# ---------- 1. Dependencias ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Solo los manifiestos: asi la capa de npm se reutiliza mientras no cambien.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

# ---------- 2. Compilacion ----------
FROM node:22-alpine AS build
WORKDIR /app

# Se arrastra la etapa anterior entera en vez de node_modules uno a uno: npm eleva
# casi todo a la raiz del monorepo y las carpetas de cada espacio de trabajo pueden
# no llegar a existir, lo que rompia la construccion.
COPY --from=deps /app ./
# El codigo se superpone encima; .dockerignore deja fuera node_modules y dist.
COPY . .

# vue-tsc y tsc fallan el build si hay errores de tipos: eso es deliberado.
RUN npm run build --workspace @bookstudio/web \
 && npm run build --workspace @bookstudio/api

# ---------- 3. Imagen final ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Solo las dependencias de ejecucion; tsx, vite y compania se quedan fuera.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev && npm cache clean --force

# La API compilada, el frontend compilado y las migraciones (que van en .sql).
COPY --from=build /app/apps/api/dist ./apps/api/dist
# migrate.js busca las migraciones junto a si mismo, dentro de dist.
COPY --from=build /app/apps/api/src/db/migrations ./apps/api/dist/db/migrations
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY docker-entrypoint.sh ./

# Los archivos subidos viven aqui: montar un volumen en esta ruta.
RUN mkdir -p /app/apps/api/storage \
 && chmod +x docker-entrypoint.sh \
 && chown -R node:node /app

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
