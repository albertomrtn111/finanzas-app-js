// Comprobación de salud: la usan Docker, el despliegue y la monitorización externa.
import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.AUTH_TEST_URL;

test('/api/health responde sin sesión, sin detalles internos y sin caché', { skip: !base }, async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') || '', /no-store/);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['base_de_datos', 'estado', 'version']);
    assert.equal(body.estado, 'ok');
    assert.equal(body.base_de_datos, 'ok');
});
