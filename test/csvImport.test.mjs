import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, normalizeImportDate, normalizeImportAmount } from '../src/lib/csvImport.js';

test('lee el formato separado por punto y coma de la exportación, con comillas y saltos de línea', () => {
    const rows = parseCSV('\uFEFFdate;amount;category;notes\r\n2026-10-04;12.50;Comida;"Café; pan"\r\n2026-10-05;3.20;Comida;"línea 1\n línea 2"');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].notes, 'Café; pan');
    assert.equal(rows[1].notes, 'línea 1\n línea 2');
    assert.equal(rows[1]._rowNum, 3);
});

test('detecta columnas incompletas y comillas rotas', () => {
    assert.equal(parseCSV('date,amount\n2026-10-04')[0]._columnError, true);
    assert.throws(() => parseCSV('date,amount\n"2026-10-04,2'), /comillas/);
});

test('valida fechas reales e importes españoles', () => {
    assert.equal(normalizeImportDate('04/10/2026'), '2026-10-04');
    assert.equal(normalizeImportDate('31/02/2026'), null);
    assert.equal(normalizeImportAmount('1.234,56'), 1234.56);
    assert.equal(normalizeImportAmount('1,234.56'), 1234.56);
    assert.equal(normalizeImportAmount('12abc'), null);
    assert.equal(normalizeImportAmount('0'), null);
});
