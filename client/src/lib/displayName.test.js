import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_NAME_LENGTH, validateDisplayName } from './displayName.js';

describe('validateDisplayName', () => {
  it('accepts and trims Russian names', () => {
    expect(validateDisplayName('  Алексей Иванов  ')).toEqual({
      ok: true,
      value: 'Алексей Иванов',
      error: ''
    });
  });

  it('blocks empty names', () => {
    expect(validateDisplayName('   ')).toEqual({
      ok: false,
      value: '',
      error: 'Введите имя'
    });
  });

  it('clips names to 30 characters', () => {
    expect(validateDisplayName('А'.repeat(MAX_DISPLAY_NAME_LENGTH + 5))).toEqual({
      ok: true,
      value: 'А'.repeat(MAX_DISPLAY_NAME_LENGTH),
      error: ''
    });
  });

  it('rejects unsafe characters', () => {
    expect(validateDisplayName('<script>')).toEqual({
      ok: false,
      value: '<script>',
      error: 'Имя может содержать только буквы, цифры, пробел, дефис и апостроф'
    });
  });

  it('removes control characters before validation', () => {
    expect(validateDisplayName('\u0000  Алекс\u0007 Иванов  ')).toEqual({
      ok: true,
      value: 'Алекс Иванов',
      error: ''
    });
  });

  it('rejects non-string values without throwing', () => {
    expect(validateDisplayName(null)).toEqual({
      ok: false,
      value: '',
      error: 'Введите имя'
    });
  });
});
