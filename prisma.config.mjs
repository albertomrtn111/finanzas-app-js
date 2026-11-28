// Configuración de la CLI de Prisma 7 (generate, migrate, validate, studio).
// La app no la usa: se conecta con el adaptador de pg desde src/lib/db.js.
import { defineConfig } from 'prisma/config';

// Prisma 7 ya no lee .env por su cuenta. En local se carga si existe, sin pisar las variables ya
// definidas; en el servidor llegan del docker compose y en la imagen no hay .env.
try {
    process.loadEnvFile();
} catch (error) {
    if (error?.code !== 'ENOENT') throw error;
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
    datasource: {
        // process.env y no env(): generate y validate no necesitan base de datos (la imagen se
        // construye sin DATABASE_URL). migrate deploy falla con un error claro si falta.
        url: process.env.DATABASE_URL ?? '',
        // Base de datos vacía de usar y tirar para comparar migraciones (scripts/check-migrations.mjs).
        shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    },
});
