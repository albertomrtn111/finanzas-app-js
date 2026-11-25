import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppDate, localDateKey } from '../src/lib/dateUtils.js';
import { formatDate } from '../src/lib/dateFormat.js';

test('interpreta fechas de calendario sin desplazar el día', () => {
    assert.equal(localDateKey(parseAppDate('2026-10-04T00:00:00.000Z')), '2026-10-04');
    assert.equal(formatDate('2026-10-04T00:00:00.000Z'), '4 oct 2026');
    assert.equal(parseAppDate('31/02/2026'), null);
});
