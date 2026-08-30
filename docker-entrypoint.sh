#!/bin/sh
# Aplica las migraciones pendientes y arranca la API.
# Son idempotentes (schema_migrations lleva la cuenta), asi que es seguro en cada
# arranque, incluso si Coolify reinicia el contenedor.
set -e

echo "[bookstudio] aplicando migraciones..."
node --experimental-strip-types apps/api/dist/db/migrate.js 2>/dev/null \
  || node apps/api/dist/db/migrate.js

echo "[bookstudio] revisando la cuenta de administracion..."
node apps/api/dist/db/bootstrap-admin.js

echo "[bookstudio] arrancando la API en el puerto ${PORT:-4000}"
exec node apps/api/dist/server.js
