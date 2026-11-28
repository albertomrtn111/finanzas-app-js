import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_PERSONAL_SPACE, checkSession } from '../src/lib/sessionCheck.js';

const denied = { status: 401, error: 'No autorizado' };

test('sin sesión o sin usuario válido responde 401 «No autorizado»', () => {
    for (const session of [null, undefined, {}, { user: null }, { user: {} }, { user: { id: '' } }, { user: { id: 0 } }, { user: { id: -3 } }, { user: { id: 'abc' } }, { user: { id: 1.5 } }]) {
        assert.deepEqual(checkSession(session), denied, JSON.stringify(session));
    }
});

test('devuelve el id numérico y el modo de cuenta', () => {
    assert.deepEqual(checkSession({ user: { id: 7, accountMode: 'BOTH' } }), { userId: 7, accountMode: 'BOTH' });
    assert.deepEqual(checkSession({ user: { id: '12', accountMode: 'COMPANY' } }), { userId: 12, accountMode: 'COMPANY' });
});

test('las rutas personales rechazan las cuentas sin espacio personal con el mismo 401', () => {
    for (const mode of ['COMPANY', 'UNSET']) {
        assert.deepEqual(checkSession({ user: { id: 3, accountMode: mode } }, { deny: NO_PERSONAL_SPACE }), denied, mode);
    }
    for (const mode of ['PERSONAL', 'BOTH', undefined]) {
        assert.deepEqual(checkSession({ user: { id: 3, accountMode: mode } }, { deny: NO_PERSONAL_SPACE }), { userId: 3, accountMode: mode }, String(mode));
    }
});
