import test from 'node:test';
import assert from 'node:assert/strict';
import { pgConnection } from '../src/lib/dbConnection.js';

test('URL sin parámetros de Prisma: tiempos como en Prisma 6 y tamaño de pool por defecto de pg', () => {
    const url = 'postgresql://usuario:clave@finanzas_postgres:5432/finanzas';
    const { pool, schema } = pgConnection(url);
    assert.deepEqual(pool, { connectionString: url, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 300_000 });
    assert.equal(schema, undefined);
});

test('connection_limit, pool_timeout y connect_timeout pasan al pool de pg', () => {
    const { pool } = pgConnection('postgresql://postgres:postgres@127.0.0.1:55451/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&pool_timeout=20&connect_timeout=5');
    assert.equal(pool.max, 1);
    assert.equal(pool.connectionTimeoutMillis, 20_000);
    assert.equal(pgConnection('postgresql://h/db?pool_timeout=0').pool.connectionTimeoutMillis, 0, '0 es sin límite');
    assert.equal(pgConnection('postgresql://h/db?connection_limit=abc').pool.max, undefined);
    assert.equal(pgConnection('postgresql://h/db?connect_timeout=').pool.connectionTimeoutMillis, 10_000);
});

test('schema: public no cambia nada; otro esquema se usa también en el SQL escrito a mano', () => {
    assert.deepEqual(pgConnection('postgresql://h/db?schema=public'), { pool: { connectionString: 'postgresql://h/db?schema=public', connectionTimeoutMillis: 10_000, idleTimeoutMillis: 300_000 }, schema: 'public' });
    const { pool, schema } = pgConnection('postgresql://h/db?schema=finanzas');
    assert.equal(schema, 'finanzas');
    assert.equal(pool.options, '-c search_path=finanzas');
    assert.equal(pgConnection('postgresql://h/db?schema=a;b').pool.options, undefined, 'solo identificadores simples');
});

test('sin URL (al compilar) no falla', () => {
    assert.deepEqual(pgConnection(undefined), { pool: { connectionString: undefined, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 300_000 }, schema: undefined });
});
