// Gastos e ingresos contra la app en marcha (Tareas NF-17 y NF-19): crear, editar y borrar con
// importes con coma normalizados por el formulario de la app, cada filtro de la lista (q, category,
// from/to, min/max) y su combinación, filtros no válidos, paginación y aislamiento entre usuarios.
// Necesita AUTH_TEST_URL y una base de datos de pruebas: crea usuarios. Cada prueba usa su propia IP
// (el registro admite 5 altas por hora desde la misma IP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { client as httpClient } from './helpers/httpClient.mjs';
import { emptyMovementForm, formFromRecord, movementPayload, recordToPayload } from '../src/lib/movementForm.js';

const base = process.env.AUTH_TEST_URL;
const skip = !base;
const run = randomUUID().slice(0, 8);
const ENDPOINT = { expense: '/api/expenses', income: '/api/income' };
let users = 0;

async function user(label) {
    users += 1;
    const c = httpClient(base, `10.66.${run.charCodeAt(0) % 200}.${users}`);
    const email = `movimientos-${label}-${run}@nextfinance.test`;
    const res = await c.json('/api/auth/register', 'POST', { email, password: 'clave-movimientos-1', name: `Movimientos ${label}`, accountMode: 'PERSONAL' });
    assert.equal(res.status, 201, await res.clone().text());
    assert.equal(await c.login(email, 'clave-movimientos-1'), null);
    return c;
}

// Como el formulario de la app: los importes se escriben «12,50» y movementPayload los normaliza.
async function create(c, kind, fields) {
    const { value, errors } = movementPayload(kind, { ...emptyMovementForm({ today: '2026-11-25' }), ...fields });
    assert.equal(errors, undefined, JSON.stringify(errors));
    const res = await c.json(ENDPOINT[kind], 'POST', value);
    assert.equal(res.status, 200, await res.clone().text());
    return res.json();
}

async function list(c, kind, query = '') {
    const res = await c.request(`${ENDPOINT[kind]}${query ? `?${query}` : ''}`);
    assert.equal(res.status, 200, `${kind} ${query} → ${res.status} ${await res.clone().text()}`);
    return { items: await res.json(), count: Number(res.headers.get('x-total-count')), total: res.headers.get('x-total-amount') };
}

const ids = items => items.map(item => item.id);

test('movimientos: crear, editar y borrar con importes con coma', { skip }, async () => {
    const c = await user('crud');

    const expense = await create(c, 'expense', { amount: '12,50', category: 'Supermercado', notes: '  Mercadona ', payment_method: 'Bizum' });
    assert.equal(Number(expense.amount), 12.5);
    assert.equal(expense.date.slice(0, 10), '2026-11-25');
    assert.equal(expense.notes, 'Mercadona');
    assert.equal(expense.payment_method, 'Bizum');
    assert.equal(expense.expense_type, 'Variable');
    // La categoría nueva queda dada de alta para el selector.
    const categories = await (await c.request('/api/categories?type=expense')).json();
    assert.deepEqual(categories.map(category => category.name), ['Supermercado']);

    // Editar con el mismo formulario: «1.234,56».
    const edited = movementPayload('expense', { ...formFromRecord(expense), amount: '1.234,56', notes: 'Compra del mes' });
    const putRes = await c.json('/api/expenses', 'PUT', { ...edited.value, id: expense.id });
    assert.equal(putRes.status, 200, await putRes.clone().text());
    const updated = await putRes.json();
    assert.equal(Number(updated.amount), 1234.56);
    assert.equal(updated.payment_method, 'Bizum');
    const afterEdit = await list(c, 'expense');
    assert.deepEqual(afterEdit.items.map(item => [item.id, Number(item.amount), item.notes]), [[expense.id, 1234.56, 'Compra del mes']]);
    assert.equal(afterEdit.count, 1);
    assert.equal(afterEdit.total, '1234.56');

    const income = await create(c, 'income', { amount: '1.500', category: 'Nómina', source: 'Acme' });
    assert.equal(Number(income.amount), 1500);
    assert.equal(income.source, 'Acme');

    // Borrar, y no se puede borrar dos veces.
    assert.equal((await c.request(`/api/expenses?id=${expense.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await c.request(`/api/expenses?id=${expense.id}`, { method: 'DELETE' })).status, 404);
    assert.deepEqual(await list(c, 'expense'), { items: [], count: 0, total: '0.00' });

    // «Deshacer» el borrado lo vuelve a crear con los mismos datos.
    const restoredRes = await c.json('/api/expenses', 'POST', recordToPayload('expense', updated));
    assert.equal(restoredRes.status, 200, await restoredRes.clone().text());
    const restored = await restoredRes.json();
    assert.deepEqual(
        [restored.date.slice(0, 10), Number(restored.amount), restored.category, restored.notes, restored.payment_method, restored.expense_type],
        ['2026-11-25', 1234.56, 'Supermercado', 'Compra del mes', 'Bizum', 'Variable'],
    );

    // Sin pasar por el formulario, la API sigue exigiendo punto decimal.
    assert.equal((await c.json('/api/expenses', 'POST', { date: '2026-11-25', amount: '12,50', category: 'Otra' })).status, 400);
    assert.ok(movementPayload('expense', { ...emptyMovementForm({ today: '2026-11-25' }), amount: '12,345', category: 'Otra' }).errors.amount);
});

test('movimientos: cada filtro y su combinación', { skip }, async t => {
    const c = await user('filtros');
    const e1 = await create(c, 'expense', { date: '2026-10-05', amount: '12,50', category: 'Supermercado', notes: 'Mercadona semanal', payment_method: 'Tarjeta' });
    const e2 = await create(c, 'expense', { date: '2026-10-20', amount: '45', category: 'Restaurantes', subcategory: 'Japonés', notes: 'Cena cumpleaños', payment_method: 'Efectivo' });
    const e3 = await create(c, 'expense', { date: '2026-11-02', amount: '8,90', category: 'Supermercado', notes: 'Pan y leche', payment_method: 'Bizum' });
    const e4 = await create(c, 'expense', { date: '2026-11-15', amount: '120', category: 'Hogar', subcategory: 'IKEA', payment_method: 'Transferencia', expense_type: 'Fijo' });
    const e5 = await create(c, 'expense', { date: '2026-11-15', amount: '30', category: 'Transporte', notes: 'Gasolina', payment_method: 'Tarjeta' });
    const i1 = await create(c, 'income', { date: '2026-10-01', amount: '1.500', category: 'Nómina', source: 'Empresa Acme' });
    const i2 = await create(c, 'income', { date: '2026-11-10', amount: '200', category: 'Extra', source: 'Venta bici', notes: 'Wallapop' });
    const i3 = await create(c, 'income', { date: '2026-11-20', amount: '50,25', category: 'Extra', notes: 'Reembolso Acme' });

    const expect = async (kind, query, records, total) => {
        const result = await list(c, kind, query);
        assert.deepEqual(ids(result.items), ids(records), `${kind} ${query}`);
        assert.equal(result.count, records.length, `${kind} ${query}: X-Total-Count`);
        if (total !== undefined) assert.equal(result.total, total, `${kind} ${query}: X-Total-Amount`);
    };

    await t.test('sin filtros: todo, por fecha y después por id, como siempre', async () => {
        await expect('expense', '', [e5, e4, e3, e2, e1], '216.40');
        await expect('income', '', [i3, i2, i1], '1750.25');
    });

    await t.test('q: texto sin distinguir mayúsculas en notas, subcategoría, categoría y método de pago', async () => {
        await expect('expense', 'q=mercadona', [e1]);
        await expect('expense', 'q=SUPER', [e3, e1], '21.40');
        await expect('expense', 'q=japo', [e2]);
        await expect('expense', 'q=ikea', [e4]);
        await expect('expense', 'q=bizum', [e3]);
        await expect('expense', `q=${encodeURIComponent('mercadona tarjeta')}`, [e1]);
        await expect('expense', `q=${encodeURIComponent('mercadona efectivo')}`, [], '0.00');
        await expect('income', 'q=acme', [i3, i1]);
        await expect('income', 'q=WALLAPOP', [i2]);
        await expect('income', `q=${encodeURIComponent('nómina')}`, [i1]);
    });

    await t.test('category', async () => {
        await expect('expense', 'category=Supermercado', [e3, e1], '21.40');
        await expect('expense', 'category=Ocio', [], '0.00');
        await expect('income', 'category=Extra', [i3, i2], '250.25');
    });

    await t.test('from y to', async () => {
        await expect('expense', 'from=2026-11-01', [e5, e4, e3]);
        await expect('expense', 'to=2026-10-31', [e2, e1]);
        await expect('expense', 'from=2026-11-15&to=2026-11-15', [e5, e4], '150.00');
        await expect('income', 'from=2026-11-01&to=2026-11-30', [i3, i2]);
    });

    await t.test('min y max (incluidos)', async () => {
        await expect('expense', 'min=30', [e5, e4, e2]);
        await expect('expense', 'max=12.50', [e3, e1]);
        await expect('expense', 'min=10&max=50', [e5, e2, e1], '87.50');
        await expect('income', 'min=1000', [i1]);
        await expect('income', 'max=50.25', [i3]);
    });

    await t.test('combinados', async () => {
        await expect('expense', 'category=Supermercado&from=2026-11-01', [e3], '8.90');
        await expect('expense', 'q=super&max=10', [e3]);
        await expect('expense', 'q=tarjeta&min=20&from=2026-11-01&to=2026-11-30', [e5]);
        await expect('expense', 'category=Hogar&q=mercadona', []);
        await expect('income', 'q=acme&from=2026-11-01', [i3]);
        await expect('income', 'category=Extra&min=100&to=2026-11-15', [i2]);
    });

    await t.test('paginación con filtros: el total es del filtro entero', async () => {
        for (const [offset, record] of [[0, e3], [1, e1]]) {
            const page = await list(c, 'expense', `category=Supermercado&limit=1&offset=${offset}`);
            assert.deepEqual(ids(page.items), [record.id], `offset ${offset}`);
            assert.equal(page.count, 2);
            assert.equal(page.total, '21.40');
        }
        assert.deepEqual((await list(c, 'expense', 'category=Supermercado&limit=1&offset=2')).items, []);
    });
});

test('movimientos: filtros no válidos → 400 con el motivo en español', { skip }, async () => {
    const c = await user('validacion');
    const invalid = [
        'from=2026-13-01', 'from=25/11/2026', 'to=2026-02-30', 'from=2026-11-30&to=2026-11-01',
        'min=abc', 'min=-5', 'max=12,50', 'max=1.234', 'min=20&max=10', 'min=1e3',
        `q=${'x'.repeat(101)}`, `category=${'x'.repeat(101)}`, 'q=a&q=b', 'category=A&category=B',
        'limit=0', 'limit=501', 'offset=-1', 'limit=abc',
    ];
    for (const kind of ['expense', 'income']) {
        for (const query of invalid) {
            const res = await c.request(`${ENDPOINT[kind]}?${query}`);
            assert.equal(res.status, 400, `${kind} ${query}`);
            const body = await res.json();
            assert.match(body.error, /debe|no puede|repetido|Paginación/, `${kind} ${query}: ${body.error}`);
        }
    }
    // Los mismos parámetros vacíos no filtran.
    assert.equal((await c.request('/api/expenses?q=&category=&from=&to=&min=&max=')).status, 200);
});

test('movimientos: paginación de 50 con «Cargar más»', { skip }, async () => {
    const c = await user('paginas');
    const pad = value => String(value).padStart(2, '0');
    for (let i = 0; i < 55; i += 1) {
        await create(c, 'expense', { date: `2026-09-${pad(1 + (i % 28))}`, amount: `${i + 1},00`, category: 'Lote', notes: `LOTE ${i}` });
    }
    await create(c, 'expense', { date: '2026-09-15', amount: '1', category: 'Otra', notes: 'No es de la serie' });

    const first = await list(c, 'expense', 'q=lote&limit=50&offset=0');
    const second = await list(c, 'expense', 'q=lote&limit=50&offset=50');
    assert.equal(first.items.length, 50);
    assert.equal(second.items.length, 5);
    assert.equal(first.count, 55);
    assert.equal(first.total, '1540.00');
    const pages = [...ids(first.items), ...ids(second.items)];
    assert.equal(new Set(pages).size, 55, 'sin repetidos entre páginas');

    // Las páginas juntas son la lista completa, ordenada por fecha y luego por id, de más nuevo a más antiguo.
    const all = await list(c, 'expense', 'q=lote&limit=500');
    assert.deepEqual(pages, ids(all.items));
    for (let i = 1; i < all.items.length; i += 1) {
        const [previous, current] = [all.items[i - 1], all.items[i]];
        assert.ok(previous.date > current.date || (previous.date === current.date && previous.id > current.id), `orden en ${i}`);
    }

    // Compatibilidad: sin parámetros devuelve todo; solo con limit, la primera página.
    assert.equal((await list(c, 'expense')).items.length, 56);
    assert.equal((await list(c, 'expense', 'limit=50')).items.length, 50);
    assert.equal((await list(c, 'expense', 'limit=50')).count, 56);
});

test('movimientos: B nunca ve los de A con ningún filtro', { skip }, async () => {
    const a = await user('aislamiento-a');
    const b = await user('aislamiento-b');
    const MARK = `PRIVADO-${run}`;
    const records = {
        expense: await create(a, 'expense', { date: '2026-08-08', amount: '77,70', category: `Cat ${MARK}`, subcategory: MARK, notes: MARK }),
        income: await create(a, 'income', { date: '2026-08-08', amount: '999,99', category: `Ing ${MARK}`, source: MARK, notes: MARK }),
    };
    // B tiene un gasto con la misma fecha e importe: los filtros sí le devuelven lo suyo.
    const own = await create(b, 'expense', { date: '2026-08-08', amount: '77,70', category: 'Propio', notes: 'de B' });

    for (const kind of ['expense', 'income']) {
        const record = records[kind];
        const amount = Number(record.amount).toFixed(2);
        const queries = [
            '', 'limit=500&offset=0',
            `q=${MARK}`, `q=${MARK.toLowerCase()}`, `q=${encodeURIComponent(record.category)}`,
            `category=${encodeURIComponent(record.category)}`,
            'from=2026-08-08&to=2026-08-08', 'from=1900-01-01', 'to=2100-12-31',
            `min=${amount}&max=${amount}`, 'min=0',
            `q=${MARK}&category=${encodeURIComponent(record.category)}&from=2026-08-01&to=2026-08-31&min=${amount}&max=${amount}&limit=50&offset=0`,
        ];
        for (const query of queries) {
            const asB = await list(b, kind, query);
            assert.equal(ids(asB.items).includes(record.id), false, `B ve el ${kind} de A con «${query}»`);
            assert.equal(JSON.stringify(asB.items).includes(MARK), false, `${kind} ${query}`);
            assert.equal(asB.count, asB.items.length, `B no cuenta lo de A con «${query}»`);
            const asA = await list(a, kind, query);
            assert.ok(ids(asA.items).includes(record.id), `A ve su ${kind} con «${query}»`);
        }
        const mine = await list(b, kind, `from=2026-08-08&to=2026-08-08&min=${amount}&max=${amount}`);
        assert.deepEqual(ids(mine.items), kind === 'expense' ? [own.id] : []);
    }
});
