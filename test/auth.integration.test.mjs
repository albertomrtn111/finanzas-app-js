// Inicio de sesión, registro, sesiones y contraseña contra la app en marcha.
// Necesita AUTH_TEST_URL (por ejemplo http://localhost:3100) y una base de datos de pruebas:
// crea usuarios. Cada prueba usa su propia IP en X-Real-Ip para no compartir límites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { client as httpClient } from './helpers/httpClient.mjs';

const base = process.env.AUTH_TEST_URL;
const skip = !base;
const run = randomUUID().slice(0, 8);
const ip = name => `10.${run.charCodeAt(0) % 200}.${run.charCodeAt(1) % 200}.${name}`;

const client = ipAddress => httpClient(base, ipAddress);

async function register(c, email, password = 'clave-inicial-1') {
    return c.json('/api/auth/register', 'POST', { email, password, name: 'Prueba acceso', accountMode: 'PERSONAL' });
}

test('acceso: límites, sesiones y contraseña', { skip }, async t => {
    const email = `acceso-${run}@nextfinance.test`;
    const setup = client(ip(1));
    assert.equal((await register(setup, email)).status, 201);

    await t.test('el error es el mismo exista o no el email', async () => {
        const c = client(ip(2));
        assert.equal(await c.login(email, 'mala-clave'), 'Email o contraseña incorrectos');
        assert.equal(await c.login(`nadie-${run}@nextfinance.test`, 'mala-clave'), 'Email o contraseña incorrectos');
    });

    await t.test('tras 5 fallos desde una IP se bloquea ese email desde esa IP, no desde otras', async () => {
        const attacker = client(ip(3));
        for (let i = 0; i < 5; i += 1) assert.equal(await attacker.login(email, `mala-${i}`), 'Email o contraseña incorrectos');
        assert.match(await attacker.login(email, 'clave-inicial-1'), /^Demasiados intentos/);
        const owner = client(ip(4));
        assert.equal(await owner.login(email, 'clave-inicial-1'), null);
        assert.equal((await owner.session()).user.email, email);
    });

    await t.test('la sesión refleja los cambios sin volver a entrar', async () => {
        const c = client(ip(5));
        assert.equal(await c.login(email, 'clave-inicial-1'), null);
        assert.equal((await c.json('/api/user/profile', 'PATCH', { name: 'Nombre nuevo' })).status, 200);
        assert.equal((await c.session()).user.name, 'Nombre nuevo');
    });

    await t.test('cerrar todas las sesiones invalida las abiertas', async () => {
        const phone = client(ip(6));
        const laptop = client(ip(7));
        assert.equal(await phone.login(email, 'clave-inicial-1'), null);
        assert.equal(await laptop.login(email, 'clave-inicial-1'), null);
        assert.equal((await laptop.request('/api/user/sessions', { method: 'DELETE' })).status, 200);
        assert.deepEqual(await phone.session(), {});
        assert.equal((await phone.request('/api/user/profile')).status, 401);
        assert.equal((await laptop.request('/api/user/profile')).status, 401);
        const again = client(ip(8));
        assert.equal(await again.login(email, 'clave-inicial-1'), null);
        assert.equal((await again.request('/api/user/profile')).status, 200);
    });

    await t.test('cambiar la contraseña pide la actual, cierra las sesiones y solo vale la nueva', async () => {
        const c = client(ip(9));
        assert.equal(await c.login(email, 'clave-inicial-1'), null);
        assert.equal((await c.request('/api/user/password', { method: 'PATCH', body: '{}' })).status, 415);
        const wrong = await c.json('/api/user/password', 'PATCH', { currentPassword: 'mala', newPassword: 'clave-nueva-22' });
        assert.equal(wrong.status, 400);
        const short = await c.json('/api/user/password', 'PATCH', { currentPassword: 'clave-inicial-1', newPassword: 'corta' });
        assert.equal(short.status, 400);
        const ok = await c.json('/api/user/password', 'PATCH', { currentPassword: 'clave-inicial-1', newPassword: 'clave-nueva-22' });
        assert.equal(ok.status, 200);
        assert.deepEqual(await c.session(), {});
        const after = client(ip(10));
        assert.equal(await after.login(email, 'clave-inicial-1'), 'Email o contraseña incorrectos');
        assert.equal(await after.login(email, 'clave-nueva-22'), null);
    });

    await t.test('sin sesión no se puede cambiar la contraseña ni cerrar sesiones', async () => {
        const c = client(ip(11));
        assert.equal((await c.json('/api/user/password', 'PATCH', { newPassword: 'clave-nueva-33' })).status, 401);
        assert.equal((await c.request('/api/user/sessions', { method: 'DELETE' })).status, 401);
    });

    await t.test('el registro se limita a 5 por hora desde la misma conexión', async () => {
        const c = client(ip(12));
        const statuses = [];
        for (let i = 0; i < 6; i += 1) statuses.push((await register(c, `registro-${run}-${i}@nextfinance.test`)).status);
        assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
    });
});
