import test from 'node:test';
import assert from 'node:assert/strict';
import { asciiFilename, cleanFilename, contentDisposition, formatMb, matchesMime } from '../src/lib/attachments.js';

test('el nombre guardado conserva tildes y símbolos, sin rutas ni caracteres de control', () => {
    assert.equal(cleanFilename('Factura – octubre €.pdf'), 'Factura – octubre €.pdf');
    assert.equal(cleanFilename('../../etc/passwd'), '.._.._etc_passwd');
    assert.equal(cleanFilename('a\r\nb\u0000.pdf'), 'a__b_.pdf');
    assert.equal(cleanFilename(''), 'documento');
    assert.equal(cleanFilename('x'.repeat(300)).length, 180);
});

test('la cabecera de descarga solo lleva ASCII y conserva el nombre real codificado', () => {
    const header = contentDisposition('Factura – octubre €; "año".pdf');
    assert.ok(/^[\x20-\x7e]+$/.test(header), header);
    assert.equal(asciiFilename('Factura – octubre €; "año".pdf'), 'Factura _ octubre __ _ano_.pdf');
    assert.ok(header.includes("filename*=UTF-8''Factura%20%E2%80%93%20octubre%20%E2%82%AC%3B%20%22a%C3%B1o%22.pdf"));
    // Node rechaza cabeceras con caracteres fuera de Latin-1: esta no debe fallar.
    assert.doesNotThrow(() => new Headers({ 'Content-Disposition': header }));
});

test('formato del archivo según su contenido', () => {
    assert.equal(matchesMime(Buffer.from('%PDF-1.7 ...'), 'application/pdf'), true);
    assert.equal(matchesMime(Buffer.from('<html>'), 'application/pdf'), false);
    assert.equal(matchesMime(Buffer.from([255, 216, 255, 0]), 'image/jpeg'), true);
});

test('megas en español', () => {
    assert.equal(formatMb(200 * 1024 * 1024), '200 MB');
    assert.equal(formatMb(1.5 * 1024 * 1024), '1,5 MB');
});
