import { describe, expect, it } from 'vitest';
import { canSendMessage, formatMessageTime, normalizeOutgoingMessage } from './chat.js';

describe('normalizeOutgoingMessage', () => {
  it('trims text', () => {
    expect(normalizeOutgoingMessage('  Привет  ')).toBe('Привет');
  });

  it('keeps HTML-like text as a plain string for React escaping', () => {
    expect(normalizeOutgoingMessage('  <b>Привет</b>  ')).toBe('<b>Привет</b>');
  });

  it('normalizes nullish values to an empty string', () => {
    expect(normalizeOutgoingMessage(null)).toBe('');
    expect(normalizeOutgoingMessage(undefined)).toBe('');
  });
});

describe('canSendMessage', () => {
  it('blocks empty messages', () => {
    expect(canSendMessage('   ')).toBe(false);
    expect(canSendMessage('Привет')).toBe(true);
  });
});

describe('formatMessageTime', () => {
  it('formats local time as HH:MM', () => {
    expect(formatMessageTime(0, () => new Date(2026, 0, 1, 9, 5))).toBe('09:05');
  });
});
