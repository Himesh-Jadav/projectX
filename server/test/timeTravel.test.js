import test from 'node:test';
import assert from 'node:assert/strict';
import { wasActiveAt } from '../services/timeTravel.js';

test('a memory superseded yesterday was active two days ago but not now', () => {
  const memory = {
    createdAt: new Date('2026-10-20T12:00:00.000Z'),
    status: 'superseded',
    statusChangedAt: new Date('2026-10-28T12:00:00.000Z')
  };

  assert.equal(wasActiveAt(memory, new Date('2026-10-27T12:00:00.000Z')), true);
  assert.equal(wasActiveAt(memory, new Date('2026-10-29T12:00:00.000Z')), false);
});
