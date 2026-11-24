import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, hit, isLimited, minutesText, reset, resetAll } from '../src/lib/rateLimit.js';

const rule = { limit: 3, windowMs: 1000 };

test('cuenta intentos y bloquea al pasar el límite dentro de la ventana', () => {
    resetAll();
    assert.equal(isLimited('k', rule, 0).limited, false);
    assert.equal(hit('k', rule, 0).allowed, true);
    assert.equal(hit('k', rule, 10).allowed, true);
    assert.equal(hit('k', rule, 20).allowed, true);
    assert.equal(isLimited('k', rule, 30).limited, true);
    assert.equal(isLimited('k', rule, 30).retryAfterMs, 970);
    assert.equal(hit('k', rule, 40).allowed, false);
});

test('la ventana caduca y reset borra el contador', () => {
    resetAll();
    for (let i = 0; i < 3; i += 1) hit('k', rule, 0);
    assert.equal(isLimited('k', rule, 999).limited, true);
    assert.equal(isLimited('k', rule, 1000).limited, false);
    assert.equal(hit('k', rule, 1000).allowed, true);
    reset('k');
    assert.equal(isLimited('k', rule, 1001).limited, false);
});

test('las claves son independientes', () => {
    resetAll();
    for (let i = 0; i < 3; i += 1) hit('a', rule, 0);
    assert.equal(isLimited('a', rule, 1).limited, true);
    assert.equal(isLimited('b', rule, 1).limited, false);
});

test('IP del cliente: X-Real-Ip, si no la última de X-Forwarded-For', () => {
    assert.equal(clientIp(new Headers({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })), '1.2.3.4');
    assert.equal(clientIp({ 'x-forwarded-for': '9.9.9.9, 5.6.7.8' }), '5.6.7.8');
    assert.equal(clientIp({}), 'desconocida');
    assert.equal(clientIp(undefined), 'desconocida');
});

test('minutos en texto', () => {
    assert.equal(minutesText(1), '1 minuto');
    assert.equal(minutesText(61000), '2 minutos');
});
