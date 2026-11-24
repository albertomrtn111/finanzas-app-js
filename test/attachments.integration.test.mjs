// Documentos adjuntos de empresa contra la app en marcha.
// Necesita AUTH_TEST_URL y una base de datos de pruebas: crea usuarios y empresas.
// La prueba de cuota solo corre si la app se arrancó con ATTACHMENT_QUOTA_MB=1 y se indica
// ATTACHMENT_TEST_QUOTA_MB=1 al lanzar las pruebas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { client as httpClient } from './helpers/httpClient.mjs';

const base = process.env.AUTH_TEST_URL;
const skip = !base;
const run = randomUUID().slice(0, 8);
const pdf = size => {
    const body = Buffer.alloc(size, 32);
    body.write('%PDF-1.4\n');
    return body;
};

async function userWithBusiness(ipLast, label) {
    const c = httpClient(base, `10.77.${run.charCodeAt(0) % 200}.${ipLast}`);
    const email = `adjuntos-${label}-${run}@nextfinance.test`;
    const created = await c.json('/api/auth/register', 'POST', { email, password: 'clave-adjuntos-1', name: 'Adjuntos', accountMode: 'BOTH', businessName: `Empresa ${label}`, businessKind: 'SELF_EMPLOYED' });
    assert.equal(created.status, 201);
    assert.equal(await c.login(email, 'clave-adjuntos-1'), null);
    const [business] = await (await c.request('/api/businesses')).json();
    return { c, businessId: business.id };
}

async function activity(c, businessId, description) {
    const res = await c.json(`/api/businesses/${businessId}/activities`, 'POST', { direction: 'EXPENSE', description, category: 'Material', occurred_on: '2026-11-02', tax_lines: [{ base: 10, vat_rate: 0 }] });
    assert.equal(res.status, 201, await res.clone().text());
    return (await res.json()).id;
}

function upload(c, businessId, activityId, name, content) {
    const form = new FormData();
    form.append('activityId', String(activityId));
    form.append('file', new Blob([content], { type: 'application/pdf' }), name);
    return c.request(`/api/businesses/${businessId}/attachments`, { method: 'POST', body: form });
}

test('adjuntos de empresa', { skip }, async t => {
    const { c, businessId } = await userWithBusiness(1, 'a');
    const activityId = await activity(c, businessId, 'Compra con factura');

    await t.test('un nombre con «–» y «€» se sube y se descarga', async () => {
        const content = pdf(2000);
        const res = await upload(c, businessId, activityId, 'Factura – octubre €.pdf', content);
        assert.equal(res.status, 201);
        const saved = await res.json();
        assert.equal(saved.filename, 'Factura – octubre €.pdf');
        const download = await c.request(`/api/businesses/${businessId}/attachments?id=${saved.id}`);
        assert.equal(download.status, 200);
        assert.match(download.headers.get('content-disposition'), /filename\*=UTF-8''Factura%20%E2%80%93%20octubre%20%E2%82%AC\.pdf/);
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), content);
    });

    await t.test('un envío de más de 5 MB se rechaza sin leerlo', async () => {
        const res = await upload(c, businessId, activityId, 'grande.pdf', pdf(6 * 1024 * 1024));
        assert.equal(res.status, 413);
        assert.match((await res.json()).error, /5 MB/);
    });

    await t.test('otro usuario no puede descargar ni subir a esa empresa', async () => {
        const other = await userWithBusiness(2, 'b');
        const [{ id }] = await (await c.request(`/api/businesses/${businessId}/activities`)).json().then(list => list.filter(a => a.id === activityId).map(a => a.attachments[0]));
        assert.equal((await other.c.request(`/api/businesses/${businessId}/attachments?id=${id}`)).status, 404);
        assert.equal((await other.c.request(`/api/businesses/${other.businessId}/attachments?id=${id}`)).status, 404);
        assert.equal((await upload(other.c, businessId, activityId, 'x.pdf', pdf(100))).status, 404);
    });

    await t.test('borrar una operación con documentos exige confirmarlo', async () => {
        const refused = await c.request(`/api/businesses/${businessId}/activities?id=${activityId}`, { method: 'DELETE' });
        assert.equal(refused.status, 409);
        assert.equal((await refused.json()).adjuntos, 1);
        const confirmed = await c.request(`/api/businesses/${businessId}/activities?id=${activityId}&adjuntos=borrar`, { method: 'DELETE' });
        assert.equal(confirmed.status, 200);
        const plain = await activity(c, businessId, 'Sin documentos');
        assert.equal((await c.request(`/api/businesses/${businessId}/activities?id=${plain}`, { method: 'DELETE' })).status, 200);
    });

    await t.test('la cuota de espacio cuenta todas las empresas del usuario', { skip: process.env.ATTACHMENT_TEST_QUOTA_MB !== '1' }, async () => {
        const { c: owner, businessId: first } = await userWithBusiness(3, 'cuota');
        const second = (await (await owner.json('/api/businesses', 'POST', { name: 'Segunda', kind: 'SELF_EMPLOYED' })).json()).id;
        const a1 = await activity(owner, first, 'Uno');
        const a2 = await activity(owner, second, 'Dos');
        assert.equal((await upload(owner, first, a1, 'uno.pdf', pdf(400 * 1024))).status, 201);
        assert.equal((await upload(owner, second, a2, 'dos.pdf', pdf(400 * 1024))).status, 201);
        const full = await upload(owner, second, a2, 'tres.pdf', pdf(400 * 1024));
        assert.equal(full.status, 413);
        assert.match((await full.json()).error, /No queda espacio/);
    });
});
