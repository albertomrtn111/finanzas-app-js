// Empresa contra la app en marcha: previsión, borrados protegidos, trimestres de IVA cerrados,
// importes estrictos y errores siempre en JSON. Necesita AUTH_TEST_URL y una base de datos de
// pruebas: crea usuarios y empresas. Cada usuario usa su propia IP (el registro admite 5 por hora).
// Las comprobaciones directas en la base de datos (índices, claves ajenas y borrado en cascada de una
// empresa o un usuario entero) usan además DATABASE_URL y solo corren si apunta a una base local.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { client as httpClient } from './helpers/httpClient.mjs';

const base = process.env.AUTH_TEST_URL;
const skip = !base;
const databaseUrl = process.env.DATABASE_URL || '';
const skipDatabase = skip || !/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(databaseUrl);
const run = randomUUID().slice(0, 8);
let users = 0;

// Fechas relativas a hoy en Madrid: una del trimestre actual y otra del anterior (ya cerrado).
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const [year, month] = today.split('-').map(Number);
const quarterStart = month - ((month - 1) % 3);
const pad = value => String(value).padStart(2, '0');
const thisQuarterDay = `${year}-${pad(quarterStart)}-01`;
const closedDay = quarterStart === 1 ? `${year - 1}-10-15` : `${year}-${pad(quarterStart - 3)}-15`;
const quarterOf = day => `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
const closedQuarter = quarterOf(closedDay);

async function userWithBusiness(label) {
    users += 1;
    const c = httpClient(base, `10.88.${run.charCodeAt(0) % 200}.${users}`);
    const email = `empresa-${label}-${run}@nextfinance.test`;
    const created = await c.json('/api/auth/register', 'POST', { email, password: 'clave-empresa-1', name: 'Empresa', accountMode: 'BOTH', businessName: `Empresa ${label}`, businessKind: 'SELF_EMPLOYED' });
    assert.equal(created.status, 201, await created.clone().text());
    assert.equal(await c.login(email, 'clave-empresa-1'), null);
    const [business] = await (await c.request('/api/businesses')).json();
    const path = `/api/businesses/${business.id}`;
    // Llama a la API y exige siempre una respuesta JSON, también en los errores.
    const api = async (method, route, body) => {
        const res = body === undefined ? await c.request(`${path}${route}`, { method }) : await c.json(`${path}${route}`, method, body);
        const text = await res.text();
        try {
            return { status: res.status, data: JSON.parse(text) };
        } catch {
            return assert.fail(`${method} ${route} no devolvió JSON (${res.status}): ${text.slice(0, 120)}`);
        }
    };
    return { c, email, businessId: business.id, path, api };
}

const expense = (overrides = {}) => ({ direction: 'EXPENSE', description: 'Gasto', category: 'Material', occurred_on: today, tax_lines: [{ base: '500', vat_rate: 0 }], ...overrides });
const invoice = (number, overrides = {}) => ({
    direction: 'INCOME', description: 'Consultoría', category: 'Servicios', occurred_on: closedDay,
    document_kind: 'INVOICE', document_number: number, document_date: closedDay, counterparty_name: 'Cliente SL',
    tax_lines: [{ base: '1000', vat_rate: 21 }], ...overrides,
});

async function account(api, name, opening_balance = '0') {
    const res = await api('POST', '/accounts', { name, kind: 'BANK', opening_balance, opening_on: '2025-01-01' });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    return res.data.id;
}

test('empresa de extremo a extremo', { skip }, async t => {
    await t.test('una cuenta con movimientos no se borra y no se pierde nada', async () => {
        const { api } = await userWithBusiness('cuenta');
        const bank = await account(api, 'Banco');
        const move = await api('POST', '/movements', { account_id: bank, date: today, direction: 'IN', amount: '100', description: 'Cobro', flow_type: 'OPERATING' });
        assert.equal(move.status, 201);
        const refused = await api('DELETE', `/accounts?id=${bank}`);
        assert.equal(refused.status, 409);
        assert.match(refused.data.error, /tiene movimientos/);
        const accounts = await api('GET', '/accounts');
        assert.equal(accounts.data.find(a => a.id === bank).balance, '100.00');
        assert.equal((await api('GET', '/movements')).data.length, 1);
        const empty = await account(api, 'Caja vacía');
        assert.equal((await api('DELETE', `/accounts?id=${empty}`)).status, 200);
    });

    await t.test('borrar un movimiento borra sus vínculos y la factura vuelve a estar pendiente', async () => {
        const { api } = await userWithBusiness('vinculos');
        const bank = await account(api, 'Banco');
        const sale = await api('POST', '/activities', { ...expense({ direction: 'INCOME', description: 'Venta', due_on: today }), tax_lines: [{ base: '200', vat_rate: 0 }] });
        assert.equal(sale.status, 201);
        const move = await api('POST', '/movements', { account_id: bank, date: today, direction: 'IN', amount: '200', description: 'Cobro venta', allocations: [{ activity_id: sale.data.id, amount: '200' }] });
        assert.equal(move.status, 201, JSON.stringify(move.data));
        const linked = await api('DELETE', `/activities?id=${sale.data.id}`);
        assert.equal(linked.status, 409);
        assert.match(linked.data.error, /Desvincula/);
        assert.equal((await api('GET', '/summary')).data.pending.income, '0.00');
        assert.equal((await api('DELETE', `/movements?id=${move.data.id}`)).status, 200);
        const [activity] = (await api('GET', '/activities')).data;
        assert.deepEqual(activity.allocations, []);
        assert.equal((await api('GET', '/summary')).data.pending.income, '200.00');
        assert.equal((await api('DELETE', `/activities?id=${sale.data.id}`)).status, 200);
    });

    await t.test('un pendiente sin vencimiento cuenta ya en la previsión', async () => {
        const { api } = await userWithBusiness('prevision');
        await account(api, 'Banco', '1000');
        assert.equal((await api('POST', '/activities', expense())).status, 201);
        const { data } = await api('GET', '/summary');
        assert.equal(data.liquid, '1000.00');
        assert.equal(data.pending.expense, '500.00');
        assert.equal(data.projected30, '500.00');
        assert.equal(data.projected90, '500.00');
    });

    await t.test('cambiar o borrar una factura de un trimestre de IVA cerrado exige confirmarlo', async () => {
        const { api } = await userWithBusiness('trimestre');
        const created = await api('POST', '/activities', invoice(`T-${run}`));
        assert.equal(created.status, 201, JSON.stringify(created.data));
        assert.equal(created.data.vat_period, closedQuarter);
        const id = created.data.id;

        const changed = invoice(`T-${run}`, { id, tax_lines: [{ base: '1200', vat_rate: 21 }] });
        const refused = await api('PATCH', '/activities', changed);
        assert.equal(refused.status, 409);
        assert.deepEqual(refused.data.trimestre_cerrado, [closedQuarter]);
        assert.match(refused.data.error, /puede estar declarado/);
        assert.equal((await api('GET', '/activities')).data[0].total_amount, '1210');

        const renamed = await api('PATCH', '/activities', invoice(`T-${run}`, { id, description: 'Consultoría (renombrada)', due_on: today }));
        assert.equal(renamed.status, 200, 'cambiar concepto o vencimiento no toca el trimestre');
        const confirmed = await api('PATCH', '/activities?trimestre=cerrado', changed);
        assert.equal(confirmed.status, 200);
        assert.equal(confirmed.data.total_amount, '1452');

        const deleteRefused = await api('DELETE', `/activities?id=${id}`);
        assert.equal(deleteRefused.status, 409);
        assert.deepEqual(deleteRefused.data.trimestre_cerrado, [closedQuarter]);
        assert.equal((await api('DELETE', `/activities?id=${id}&trimestre=cerrado`)).status, 200);

        // En el trimestre abierto nada cambia, salvo moverla a uno cerrado.
        const open = await api('POST', '/activities', invoice(`A-${run}`, { occurred_on: thisQuarterDay, document_date: thisQuarterDay }));
        assert.equal(open.status, 201);
        assert.equal((await api('PATCH', '/activities', invoice(`A-${run}`, { id: open.data.id, occurred_on: thisQuarterDay, document_date: thisQuarterDay, tax_lines: [{ base: '50', vat_rate: 21 }] }))).status, 200);
        const moved = await api('PATCH', '/activities', invoice(`A-${run}`, { id: open.data.id }));
        assert.equal(moved.status, 409);
        assert.deepEqual(moved.data.trimestre_cerrado, [closedQuarter]);
        assert.equal((await api('DELETE', `/activities?id=${open.data.id}`)).status, 200);
    });

    await t.test('el período de IVA no puede ser anterior al de la fecha de factura', async () => {
        const { api } = await userWithBusiness('periodo');
        const res = await api('POST', '/activities', invoice(`P-${run}`, { occurred_on: thisQuarterDay, document_date: thisQuarterDay, vat_period: closedQuarter }));
        assert.equal(res.status, 400);
        assert.match(res.data.error, /anterior al trimestre de la fecha de factura/);
        assert.equal((await api('GET', '/activities')).data.length, 0);
    });

    await t.test('los importes inválidos se rechazan con un 400 en JSON', async () => {
        const { api } = await userWithBusiness('importes');
        const bank = await account(api, 'Banco');
        for (const amount of [true, '0x1F', [5], '1e3', '12.345']) {
            const label = JSON.stringify(amount);
            const activity = await api('POST', '/activities', expense({ tax_lines: [{ base: amount, vat_rate: 0 }] }));
            assert.equal(activity.status, 400, `operación con ${label}`);
            assert.match(activity.data.error, /Base imponible inválida/);
            assert.equal((await api('POST', '/movements', { account_id: bank, date: today, direction: 'OUT', amount, description: 'Pago' })).status, 400, `movimiento con ${label}`);
            assert.equal((await api('POST', '/accounts', { name: `Cuenta ${label}`, opening_balance: amount, opening_on: '2025-01-01' })).status, 400, `cuenta con ${label}`);
            assert.equal((await api('POST', '/plans', { direction: 'EXPENSE', description: 'Cuota', category: 'Préstamo', due_on: today, amount })).status, 400, `previsión con ${label}`);
            assert.equal((await api('POST', '/budgets', { period: today.slice(0, 7), direction: 'EXPENSE', category: 'Material', amount })).status, 400, `presupuesto con ${label}`);
        }
        const nullRate = await api('POST', '/activities', invoice(`R-${run}`, { tax_lines: [{ base: '100', vat_rate: null }] }));
        assert.equal(nullRate.status, 400);
        assert.match(nullRate.data.error, /Tipo de IVA inválido/);
        assert.equal((await api('GET', '/activities')).data.length, 0);
        assert.equal((await api('GET', '/movements')).data.length, 0);
    });

    await t.test('un vínculo nulo o un cuerpo que no es un objeto responden 400 en JSON', async () => {
        const { c, path, api } = await userWithBusiness('json');
        const bank = await account(api, 'Banco');
        const withNull = await api('POST', '/movements', { account_id: bank, date: today, direction: 'IN', amount: '10', description: 'Cobro', allocations: [null] });
        assert.equal(withNull.status, 400);
        assert.match(withNull.data.error, /vínculo de factura/i);
        assert.equal((await api('GET', '/movements')).data.length, 0, 'el movimiento no se guarda a medias');
        const move = await api('POST', '/movements', { account_id: bank, date: today, direction: 'IN', amount: '10', description: 'Cobro' });
        assert.equal((await api('PATCH', '/movements', { id: move.data.id, allocations: [null] })).status, 400);
        for (const raw of ['null', '[1]', '42', 'no es json']) {
            const res = await c.request(`${path}/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw });
            assert.equal(res.status, 400, raw);
            assert.match(res.headers.get('content-type'), /application\/json/);
            assert.ok((await res.json()).error);
        }
    });

    await t.test('los números de factura no se repiten', async () => {
        const { api } = await userWithBusiness('numeros');
        const issued = invoice(`N-${run}`, { occurred_on: thisQuarterDay, document_date: thisQuarterDay });
        assert.equal((await api('POST', '/activities', issued)).status, 201);
        const repeated = await api('POST', '/activities', issued);
        assert.equal(repeated.status, 409);
        const received = { ...issued, direction: 'EXPENSE', counterparty_name: 'Proveedor SL' };
        assert.equal((await api('POST', '/activities', received)).status, 201, 'el número de una emitida no choca con una recibida');
        assert.equal((await api('POST', '/activities', { ...received, counterparty_name: 'PROVEEDOR sl' })).status, 409, 'mismo proveedor, sin distinguir mayúsculas');
        assert.equal((await api('POST', '/activities', { ...received, counterparty_name: 'Otro proveedor' })).status, 201, 'otro proveedor puede usar el mismo número');
    });
});

test('empresa: comprobaciones en la base de datos', { skip: skipDatabase }, async t => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    t.after(() => prisma.$disconnect());

    await t.test('los dos índices únicos parciales de números de factura existen', async () => {
        const rows = await prisma.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'business_activities' AND indexname IN ('business_issued_number_key', 'business_received_supplier_number_key') ORDER BY indexname`;
        assert.deepEqual(rows.map(r => r.indexname), ['business_issued_number_key', 'business_received_supplier_number_key']);
        for (const row of rows) assert.match(row.indexdef, /^CREATE UNIQUE INDEX .* WHERE /);
    });

    await t.test('las claves ajenas protegen cuentas y operaciones y mantienen las cascadas previstas', async () => {
        const rows = await prisma.$queryRaw`SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('business_movements_account_id_fkey', 'business_allocations_activity_id_fkey', 'business_allocations_movement_id_fkey', 'business_attachments_activity_id_fkey')`;
        // a = NO ACTION, c = CASCADE
        assert.deepEqual(Object.fromEntries(rows.map(r => [r.conname, r.confdeltype])), {
            business_movements_account_id_fkey: 'a', business_allocations_activity_id_fkey: 'a',
            business_allocations_movement_id_fkey: 'c', business_attachments_activity_id_fkey: 'c',
        });
    });

    // Rellena una empresa con todo tipo de datos enlazados y devuelve su id.
    async function populated(label) {
        const { c, email, businessId, path, api } = await userWithBusiness(label);
        const bank = await account(api, 'Banco');
        const cash = await account(api, 'Caja');
        const sale = await api('POST', '/activities', invoice(`C-${run}-${label}`, { occurred_on: thisQuarterDay, document_date: thisQuarterDay }));
        const form = new FormData();
        form.append('activityId', String(sale.data.id));
        form.append('file', new Blob([Buffer.from('%PDF-1.4\n documento')], { type: 'application/pdf' }), 'factura.pdf');
        assert.equal((await c.request(`${path}/attachments`, { method: 'POST', body: form })).status, 201);
        assert.equal((await api('POST', '/movements', { account_id: bank, date: today, direction: 'IN', amount: '100', description: 'Cobro parcial', allocations: [{ activity_id: sale.data.id, amount: '100' }] })).status, 201);
        assert.equal((await api('POST', '/movements', { flow_type: 'TRANSFER', from_account_id: bank, to_account_id: cash, date: today, amount: '20', description: 'A caja' })).status, 201);
        assert.equal((await api('POST', '/plans', { direction: 'EXPENSE', description: 'Cuota', category: 'Préstamo', due_on: today, amount: '30' })).status, 201);
        assert.equal((await api('POST', '/budgets', { period: today.slice(0, 7), direction: 'EXPENSE', category: 'Material', amount: '40' })).status, 200);
        return { email, businessId };
    }

    async function remaining(businessId) {
        const where = { business_id: businessId };
        const counts = await Promise.all([
            prisma.businessAccount.count({ where }), prisma.businessActivity.count({ where }), prisma.businessMovement.count({ where }),
            prisma.businessAllocation.count({ where }), prisma.businessAttachment.count({ where }), prisma.businessCashPlan.count({ where }),
            prisma.businessBudget.count({ where }),
        ]);
        return counts.reduce((sum, count) => sum + count, 0);
    }

    await t.test('borrar una empresa entera sigue borrando todo lo suyo en cascada', async () => {
        const { businessId } = await populated('cascada-empresa');
        assert.ok(await remaining(businessId) > 0);
        await prisma.business.delete({ where: { id: businessId } });
        assert.equal(await remaining(businessId), 0);
    });

    await t.test('borrar un usuario con SQL directo borra sus empresas y todo lo enlazado', async () => {
        const { email, businessId } = await populated('cascada-usuario');
        assert.equal(await prisma.$executeRaw`DELETE FROM users WHERE email = ${email}`, 1);
        assert.equal(await prisma.business.count({ where: { id: businessId } }), 0);
        assert.equal(await remaining(businessId), 0);
    });
});
