#!/usr/bin/env node
// Pruebas de extremo a extremo con un solo comando: npm run test:integration
//
// 1. Vacía la base de datos de DATABASE_URL y aplica todas las migraciones.
// 2. Crea dos usuarios de prueba con empresa y un acceso MCP para cada uno.
// 3. Compila la app (salvo con --sin-compilar) y la arranca en un puerto libre.
// 4. Ejecuta, una detrás de otra, todas las pruebas test/*.integration.test.mjs.
//
// BORRA TODOS LOS DATOS de DATABASE_URL. Por eso solo acepta bases de datos locales
// (localhost, 127.0.0.1 o ::1), salvo que se indique TEST_DATABASE_CONFIRM=borrar-todo.
// Una base de datos de usar y tirar sirve, por ejemplo:
//   docker compose -f docker-compose.test.yml up -d   (Postgres en el puerto 54329)
//   DATABASE_URL=postgresql://postgres:postgres@localhost:54329/nextfinance_test npm run test:integration
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const log = message => console.log(`\n▶ ${message}`);

function fail(message) {
    console.error(`\n✖ ${message}`);
    process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('Falta DATABASE_URL (una base de datos de pruebas: se borra entera).');
if (process.env.NODE_ENV === 'production') fail('No se ejecuta con NODE_ENV=production.');
const { hostname } = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) && process.env.TEST_DATABASE_CONFIRM !== 'borrar-todo') {
    fail(`La base de datos está en ${hostname}. Estas pruebas la borran entera: si de verdad es de pruebas, añade TEST_DATABASE_CONFIRM=borrar-todo.`);
}

function run(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', env: { ...process.env, ...options.env } });
    if (result.status !== 0) fail(`Ha fallado: ${command} ${commandArgs.join(' ')}`);
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

async function waitFor(url, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url, { redirect: 'manual' });
            if (res.status < 500) return;
        } catch {
            // Aún no escucha.
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`La app no responde en ${url}`);
}

// 1. Base de datos limpia con todas las migraciones.
log('Vaciando la base de datos de pruebas y aplicando las migraciones');
const { createPrismaClient } = await import('../src/lib/db.js');
let prisma = createPrismaClient();
await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
await prisma.$executeRawUnsafe('CREATE SCHEMA public');
await prisma.$disconnect();
run('npx', ['prisma', 'migrate', 'deploy']);

// 2. Usuarios de prueba.
log('Creando los usuarios de prueba');
const { generateToken, hashToken, displayPrefix } = await import('../src/lib/mcp/tokens.js');
prisma = createPrismaClient();
const tokens = {};
for (const [key, email, name] of [['A', 'prueba@nextfinance.test', 'Prueba'], ['B', 'otro@nextfinance.test', 'Otro']]) {
    const user = await prisma.user.create({ data: { email, name, account_mode: 'BOTH', onboarding_step: 5, created_at: new Date() } });
    await prisma.business.create({ data: { owner_user_id: user.id, name: `Empresa ${name}` } });
    const token = generateToken();
    await prisma.mcpToken.create({ data: { user_id: user.id, name: 'Pruebas', token_hash: hashToken(token), token_prefix: displayPrefix(token) } });
    tokens[key] = token;
}
await prisma.$disconnect();

// 3. App compilada y en marcha.
if (!args.has('--sin-compilar')) {
    log('Compilando la app');
    run('npx', ['next', 'build']);
}
const port = Number(process.env.TEST_APP_PORT) || await freePort();
const baseUrl = `http://localhost:${port}`;
const appEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NEXTAUTH_URL: baseUrl,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'secreto-solo-para-pruebas-de-integracion',
    ATTACHMENT_QUOTA_MB: '1',
};
log(`Arrancando la app en ${baseUrl}`);
const output = [];
const app = spawn('npx', ['next', 'start', '-p', String(port)], { cwd: root, env: appEnv, detached: true });
app.stdout.on('data', chunk => output.push(chunk));
app.stderr.on('data', chunk => output.push(chunk));
const stopApp = () => {
    try { process.kill(-app.pid, 'SIGTERM'); } catch { /* ya parada */ }
};
process.on('exit', stopApp);
process.on('SIGINT', () => { stopApp(); process.exit(130); });

let failed = [];
try {
    await waitFor(`${baseUrl}/login`);

    // 4. Pruebas, una detrás de otra: comparten usuarios y algunas cuentan registros.
    const files = readdirSync(path.join(root, 'test')).filter(name => name.endsWith('.integration.test.mjs')).sort((x, y) => {
        // La del MCP de extremo a extremo cuenta registros de A: va primero, con la base de datos recién creada.
        const rank = name => (name === 'mcp.integration.test.mjs' ? 0 : 1);
        return rank(x) - rank(y) || x.localeCompare(y);
    });
    const testEnv = {
        ...process.env,
        AUTH_TEST_URL: baseUrl,
        MCP_TEST_URL: `${baseUrl}/api/mcp`,
        MCP_TEST_TOKEN: tokens.A,
        MCP_TEST_TOKEN_OTRO: tokens.B,
        ATTACHMENT_TEST_QUOTA_MB: '1',
    };
    for (const file of files) {
        log(`Prueba ${file}`);
        const result = spawnSync(process.execPath, ['--test', path.join('test', file)], { cwd: root, stdio: 'inherit', env: testEnv });
        if (result.status !== 0) failed.push(file);
    }
    console.log(`\n${files.length - failed.length} de ${files.length} ficheros de pruebas en verde.`);
} catch (error) {
    failed = ['arranque de la app'];
    console.error(error.message);
} finally {
    if (failed.length) {
        console.error('\nÚltimas líneas de la app:\n' + Buffer.concat(output).toString().split('\n').slice(-40).join('\n'));
    }
    stopApp();
}

if (failed.length) fail(`Fallan: ${failed.join(', ')}`);
console.log('\n✔ Todas las pruebas de extremo a extremo pasan.');
