// Páginas Resumen, Patrimonio e Inversiones › Resumen pintadas en el servidor (Tarea NF-20).
// Crea datos por la API y comprueba que el HTML que devuelve el servidor ya trae las cifras clave
// con formato español, con y sin parámetros en la URL, y que sin sesión se redirige a /login.
// Necesita AUTH_TEST_URL y una base de datos de pruebas: crea usuarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { client as httpClient } from './helpers/httpClient.mjs';

const base = process.env.AUTH_TEST_URL;
const skip = !base;
const run = randomUUID().slice(0, 8);
// Una IP distinta por usuario: el registro admite 5 por hora y por IP.
const ip = n => `10.77.${run.charCodeAt(1) % 200}.${n}`;

// Hoy en España, como lo calcula la app, para que los datos caigan en el mes en curso.
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const year = Number(today.slice(0, 4));
const thisMonth = `${today.slice(0, 7)}-01`;
const lastYear = year - 1;

// El HTML usa espacios de no separación entre la cifra y «€», y React separa textos contiguos con
// <!-- -->: se normaliza para comparar.
const plain = html => html.replace(/<!-- -->/g, '').replace(/&nbsp;|&#160;| | /g, ' ');

async function personalUser(label, n) {
    const c = httpClient(base, ip(n));
    const email = `paginas-${label}-${run}@nextfinance.test`;
    const res = await c.json('/api/auth/register', 'POST', { email, password: 'clave-paginas-123', name: `Páginas ${label}`, accountMode: 'PERSONAL' });
    assert.equal(res.status, 201, await res.clone().text());
    assert.equal(await c.login(email, 'clave-paginas-123'), null);
    const onboarding = await c.json('/api/user/onboarding', 'PATCH', { step: 5 });
    assert.equal(onboarding.status, 200);
    return c;
}

async function ok(res) {
    assert.ok(res.status === 200 || res.status === 201, `${res.status} ${await res.clone().text()}`);
    return res.json();
}

async function page(c, path) {
    const res = await c.request(path);
    assert.equal(res.status, 200, `${path} → ${res.status} ${res.headers.get('location') || ''}`);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    return plain(await res.text());
}

function includesAll(html, texts, path) {
    for (const text of texts) assert.ok(html.includes(text), `${path}: falta «${text}»`);
}

test('páginas de resumen: el servidor devuelve las cifras ya pintadas', { skip }, async t => {
    const a = await personalUser('a', 1);
    const cashAccount = `Banco ${run}`;
    const fund = `Fondo ${run}`;
    const shares = `Acciones ${run}`;

    // Mes en curso: 2500 € de ingresos y 1345,67 € de gastos (345,67 € con presupuesto de 400 €).
    await ok(await a.json('/api/income', 'POST', { date: thisMonth, amount: '2500.00', category: 'Nómina' }));
    await ok(await a.json('/api/expenses', 'POST', { date: thisMonth, amount: '345.67', category: 'Supermercado', expense_type: 'Variable' }));
    await ok(await a.json('/api/expenses', 'POST', { date: thisMonth, amount: '1000', category: 'Alquiler', expense_type: 'Fijo' }));
    await ok(await a.json('/api/budgets', 'POST', { budgets: [{ category: 'Supermercado', monthly_amount: '400' }] }));
    // Junio del año pasado: 1800 € de ingresos y 250,40 € de gastos.
    await ok(await a.json('/api/income', 'POST', { date: `${lastYear}-06-15`, amount: '1800', category: 'Nómina' }));
    await ok(await a.json('/api/expenses', 'POST', { date: `${lastYear}-06-15`, amount: '250.40', category: 'Ocio' }));
    // Efectivo: 5000 € en diciembre del año pasado y 6234,50 € este mes.
    await ok(await a.json('/api/cash', 'POST', { date: `${lastYear}-12-15`, account: cashAccount, current_value: '5000' }));
    await ok(await a.json('/api/cash', 'POST', { date: thisMonth, account: cashAccount, current_value: '6234.50' }));
    // Inversiones: el fondo recibe 1000 € y luego 500 € (cada registro guarda su aportación, no el acumulado).
    await ok(await a.json('/api/investments', 'POST', { date: `${lastYear}-11-10`, account: fund, asset_type: 'Fondos', contribution: '1000', current_value: '1000' }));
    await ok(await a.json('/api/investments', 'POST', { date: thisMonth, account: fund, asset_type: 'Fondos', contribution: '500', current_value: '1700.25' }));
    await ok(await a.json('/api/investments', 'POST', { date: thisMonth, account: shares, asset_type: 'Acciones', contribution: '300', current_value: '280' }));

    await t.test('Resumen del mes en curso', async () => {
        const html = await page(a, '/resumen');
        includesAll(html, ['Estado financiero', '2500,00 €', '1345,67 €', '1154,33 €', 'Presupuesto mensual', '400,00 €', '345,67 €'], '/resumen');
        assert.equal(/\bTarget\b|\bYTD\b/.test(html), false);
    });

    await t.test('Resumen de un año y de un mes por la URL', async () => {
        const yearHtml = await page(a, `/resumen?anio=${lastYear}`);
        includesAll(yearHtml, [`Estado financiero · ${lastYear}`, '1800,00 €', '250,40 €', '1549,60 €'], `/resumen?anio=${lastYear}`);
        const monthHtml = await page(a, `/resumen?anio=${lastYear}&mes=6`);
        includesAll(monthHtml, [`junio de ${lastYear}`, '1800,00 €', '250,40 €'], `/resumen?anio=${lastYear}&mes=6`);
        // Parámetros raros: se ignoran y se ve el mes en curso.
        const fallback = await page(a, '/resumen?anio=abc&mes=99');
        includesAll(fallback, ['2500,00 €', '1345,67 €'], '/resumen?anio=abc&mes=99');
    });

    await t.test('Patrimonio', async () => {
        for (const path of ['/patrimonio', '/patrimonio?meses=36', '/patrimonio?meses=todo']) {
            const html = await page(a, path);
            // 6234,50 € de efectivo + 1980,25 € invertidos = 8214,75 €; plusvalía 1980,25 − 1800 = 180,25 €.
            includesAll(html, ['Patrimonio total', '8214,75 €', '6234,50 €', '1980,25 €', '+180,25 €', cashAccount, fund, shares, 'Evolución del patrimonio'], path);
            assert.equal(/\bYTD\b|>Cash<|>Inv<|\d+k</.test(html), false, `${path}: quedan términos en inglés o ejes «k»`);
        }
        const html = await page(a, '/patrimonio');
        includesAll(html, [`Variación en ${year}`, `desde el 31 dic ${lastYear}`], '/patrimonio');
    });

    await t.test('Inversiones › Resumen', async () => {
        for (const path of ['/inversiones/resumen', '/inversiones/resumen?meses=todo']) {
            const html = await page(a, path);
            includesAll(html, ['Capital aportado', '1800,00 €', 'Valor actual', '1980,25 €', 'Plusvalía', '180,25 €', '+10 %', fund, shares], path);
        }
    });

    await t.test('otro usuario no ve nada de lo anterior', async () => {
        const b = await personalUser('b', 2);
        for (const path of ['/resumen', '/patrimonio', '/inversiones/resumen']) {
            const html = await page(b, path);
            assert.equal(html.includes(run), false, `${path} enseña datos de otro usuario`);
            assert.equal(html.includes('8214,75 €') || html.includes('2500,00 €'), false, path);
        }
        includesAll(await page(b, '/patrimonio'), ['Aún no hay inversiones ni saldos'], '/patrimonio vacío');
        includesAll(await page(b, '/inversiones/resumen'), ['Aún no hay inversiones'], '/inversiones/resumen vacío');
    });
});

test('páginas de resumen: sin sesión se redirige a /login', { skip }, async () => {
    const anonymous = httpClient(base, ip(250));
    for (const path of ['/resumen', '/patrimonio', '/inversiones/resumen?meses=todo']) {
        const res = await anonymous.request(path);
        assert.ok(res.status >= 300 && res.status < 400, `${path} → ${res.status}`);
        assert.match(res.headers.get('location') || '', /\/login/, path);
    }
});
