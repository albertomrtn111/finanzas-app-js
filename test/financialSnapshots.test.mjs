import test from 'node:test';
import assert from 'node:assert/strict';
import { latestByAccount, totalLatestValue } from '../src/lib/financialSnapshots.js';

test('elige el registro más reciente por cuenta, incluso con varios movimientos el mismo día', () => {
    const records = [
        { id: 8, account: 'ETF', date: '2026-10-04T00:00:00.000Z', current_value: '150.00' },
        { id: 7, account: 'ETF', date: '2026-10-04T00:00:00.000Z', current_value: '100.00' },
        { id: 9, account: 'Banco', date: '2026-10-03T00:00:00.000Z', current_value: '50.00' },
    ];
    assert.equal(latestByAccount(records).ETF.id, 8);
    assert.equal(totalLatestValue(records), 200);
    assert.equal(totalLatestValue(records, '2026-10-03'), 50);
});
