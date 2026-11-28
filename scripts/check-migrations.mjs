#!/usr/bin/env node
// Comprueba que las migraciones (prisma/migrations) y el esquema (prisma/schema.prisma)
// describen la misma base de datos. Si alguien cambia el esquema sin crear su migración, o al
// revés, falla y enseña la diferencia en SQL.
//
// Necesita SHADOW_DATABASE_URL: una base de datos vacía de usar y tirar (se borra su contenido).
//   SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/shadow node scripts/check-migrations.mjs
import { spawnSync } from 'node:child_process';

// Índices que solo existen en el SQL de las migraciones porque Prisma no sabe representarlos
// (únicos parciales de los números de factura, 20261005_business_module). El esquema no los
// conoce y Prisma 6 proponía borrarlos: esa diferencia es la esperada. Prisma 7 ya no los tiene
// en cuenta al comparar (sin la opción previa partialIndexes) y no los propone; que siguen
// existiendo lo comprueba test/business.integration.test.mjs.
const RAW_SQL_ONLY = [
    'DROP INDEX "business_issued_number_key";',
    'DROP INDEX "business_received_supplier_number_key";',
];

const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) {
    console.error('Falta SHADOW_DATABASE_URL (una base de datos vacía de usar y tirar).');
    process.exit(1);
}

// Prisma 7 ya no acepta --shadow-database-url: la toma de shadowDatabaseUrl en prisma.config.mjs,
// que lee SHADOW_DATABASE_URL del entorno heredado.
const result = spawnSync('npx', ['prisma', 'migrate', 'diff', '--from-migrations', 'prisma/migrations', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    console.error('✖ No se ha podido comparar las migraciones con el esquema.');
    process.exit(1);
}

const pending = result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('--') && !RAW_SQL_ONLY.includes(line));

if (pending.length) {
    console.error('✖ El esquema y las migraciones no coinciden. Falta una migración con este SQL (o sobra en el esquema):\n');
    console.error(pending.join('\n'));
    process.exit(1);
}
console.log('✔ Las migraciones y el esquema coinciden.');
