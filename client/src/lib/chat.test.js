import { describe, expect, it } from 'vitest';
import { canSendMessage, formatMessageTime, normalizeOutgoingMessage } from './chat.js';

describe('normalizeOutgoingMessage', () => {
  it('trims text', () => {
    expect(normalizeOutgoingMessage('  Привет  ')).toBe('Привет');
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
