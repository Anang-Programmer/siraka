import test from 'node:test';
import assert from 'node:assert/strict';
import { loader } from './harness.mjs';

const { getErrorMessage } = loader()('src/lib/errors.ts');

test('getErrorMessage returns Error and plain PostgREST messages', () => {
  assert.equal(getErrorMessage(new Error('Request failed'), 'Fallback'), 'Request failed');
  assert.equal(getErrorMessage({ message: 'Permission denied', code: '42501', details: '', hint: null }, 'Fallback'), 'Permission denied');
  assert.equal(getErrorMessage({ message: '  Keep original spacing  ' }, 'Fallback'), '  Keep original spacing  ');
});

test('getErrorMessage uses the caller fallback for invalid or empty errors', () => {
  for (const error of [undefined, null, false, 0, 42, 'Raw error', [], {}, { message: '' }, { message: ' \n\t ' }, { message: null }, { message: 123 }, { message: {} }, new Error('')]) {
    assert.equal(getErrorMessage(error, 'Safe fallback'), 'Safe fallback');
  }
});
