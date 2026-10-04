import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppDate, localDateKey } from '../src/lib/dateUtils.js';
import { formatDateShort } from '../src/lib/utils.js';

test('interpreta fechas de calendario sin desplazar el día', () => {
    assert.equal(localDateKey(parseAppDate('2026-10-04T00:00:00.000Z')), '2026-10-04');
    assert.equal(formatDateShort('2026-10-04T00:00:00.000Z'), '04/10/2026');
    assert.equal(parseAppDate('31/02/2026'), null);
});
