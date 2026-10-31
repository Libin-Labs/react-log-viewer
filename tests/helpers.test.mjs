import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  appendLogLines,
  selectLogLines,
  getVirtualRange,
  LOG_LEVELS,
  LOG_LIMITS,
} from '../dist/esm/index.js';

const line = (id, message = id, level = 'info') => ({ id, message, level });

test('retains newest tail before applying filters and reports omitted versus filtered', () => {
  const result = selectLogLines([line('0', 'match'), line('1', 'miss'), line('2', 'MATCH')], {
    maxLines: 2,
    query: 'match',
  });
  assert.deepEqual(result, { lines: [line('2', 'MATCH')], omittedCount: 1, filteredCount: 1 });
});

test('severity sets include all when omitted and none when empty', () => {
  const lines = LOG_LEVELS.map((level) => line(level, level, level));
  assert.equal(selectLogLines(lines).lines.length, 6);
  assert.equal(selectLogLines(lines, { levels: [] }).lines.length, 0);
  assert.deepEqual(
    selectLogLines(lines, { levels: ['warn', 'fatal'] }).lines.map((l) => l.id),
    ['warn', 'fatal'],
  );
});

test('literal search has explicit case sensitivity and never evaluates patterns', () => {
  const lines = [line('a', 'CAT.*'), line('b', 'cat')];
  assert.equal(selectLogLines(lines, { query: 'cat' }).lines.length, 2);
  assert.equal(selectLogLines(lines, { query: 'cat', caseSensitive: true }).lines.length, 1);
  assert.equal(selectLogLines(lines, { query: '.*' }).lines.length, 1);
});

test('stream appending is bounded, immutable, ordered and accepts large incoming batches', () => {
  const existing = Object.freeze([line('0'), line('1')]);
  const incoming = Object.freeze([line('2'), line('3'), line('4')]);
  assert.deepEqual(
    appendLogLines(existing, incoming, 2).map((l) => l.id),
    ['3', '4'],
  );
  assert.deepEqual(
    appendLogLines(existing, [], 1).map((l) => l.id),
    ['1'],
  );
  assert.equal(existing.length, 2);
});

test('duplicate ids, empty ids and invalid levels are rejected in retained window only', () => {
  assert.throws(() => selectLogLines([line('a'), line('a')]), TypeError);
  assert.throws(() => selectLogLines([line('')]), TypeError);
  assert.throws(() => selectLogLines([line('a', 'x', 'notice')]), TypeError);
  assert.throws(() => selectLogLines([], { levels: ['notice'] }), TypeError);
  assert.doesNotThrow(() => selectLogLines([line(''), line('a')], { maxLines: 1 }));
});

test('message and total character budgets prevent oversized windows', () => {
  assert.throws(() => selectLogLines([line('a', 'x'.repeat(20001))]), RangeError);
  const lines = Array.from({ length: 251 }, (_, i) => line(String(i), 'x'.repeat(20000)));
  assert.throws(() => selectLogLines(lines), RangeError);
  assert.throws(() => selectLogLines([line('a', 123)]), TypeError);
});

test('filter limits validate even when there are no lines', () => {
  for (const maxLines of [0, -1, 1.5, Infinity, 100001]) {
    assert.throws(() => selectLogLines([], { maxLines }), RangeError);
    assert.throws(() => appendLogLines([], [], maxLines), RangeError);
  }
  assert.throws(() => selectLogLines([], { query: 'x'.repeat(1001) }), RangeError);
  assert.equal(Object.isFrozen(LOG_LIMITS), true);
  assert.equal(Object.isFrozen(LOG_LEVELS), true);
});

test('virtual ranges use exclusive ends, exact offsets and bounded overscan', () => {
  assert.deepEqual(getVirtualRange(100, 240, 120, 24, 2), {
    start: 8,
    end: 17,
    offset: 192,
    totalHeight: 2400,
  });
  assert.deepEqual(getVirtualRange(0, 0, 120, 24), { start: 0, end: 0, offset: 0, totalHeight: 0 });
});

test('scroll beyond the end clamps without producing blank windows', () => {
  const result = getVirtualRange(100, 99999, 120, 24, 0);
  assert.equal(result.start, 95);
  assert.equal(result.end, 100);
});

test('invalid virtualization dimensions reject NaN, zero, fractions and cap violations', () => {
  for (const args of [
    [-1, 0, 120, 24],
    [100001, 0, 120, 24],
    [1, NaN, 120, 24],
    [1, -1, 120, 24],
    [1, 0, 0, 24],
    [1, 0, 100001, 24],
    [1, 0, 120, 7],
    [1, 0, 120, 257],
    [1, 0, 120, 24, 101],
    [1, 0, 120.5, 24],
  ]) {
    assert.throws(() => getVirtualRange(...args), RangeError);
  }
});

test('CommonJS provides matching helpers and component', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.equal(typeof cjs.LogViewer, 'function');
  assert.deepEqual(cjs.getVirtualRange(20, 0, 100, 20), getVirtualRange(20, 0, 100, 20));
});
