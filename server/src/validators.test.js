import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  normalizeChatMessage,
  normalizeDisplayName,
  validateRoomId,
  ValidationError
} from './validators.js';

describe('validateRoomId', () => {
  it('accepts URL-safe room ids', () => {
    assert.equal(validateRoomId(' room_123-Abc '), 'room_123-Abc');
  });

  it('rejects unsafe room ids', () => {
    assert.throws(() => validateRoomId('../room'), ValidationError);
    assert.throws(() => validateRoomId('ab'), ValidationError);
    assert.throws(() => validateRoomId(''), ValidationError);
    assert.throws(() => validateRoomId(null), ValidationError);
  });

  it('rejects room ids longer than the supported contract', () => {
    assert.throws(() => validateRoomId('a'.repeat(65)), ValidationError);
  });
});

describe('normalizeDisplayName', () => {
  it('trims and accepts Russian names', () => {
    assert.equal(normalizeDisplayName('  Алексей Иванов  '), 'Алексей Иванов');
  });

  it('clips names to the configured limit', () => {
    const name = 'А'.repeat(MAX_DISPLAY_NAME_LENGTH + 5);

    assert.equal(normalizeDisplayName(name), 'А'.repeat(MAX_DISPLAY_NAME_LENGTH));
  });

  it('rejects empty and unsafe names', () => {
    assert.throws(() => normalizeDisplayName('   '), ValidationError);
    assert.throws(() => normalizeDisplayName('<script>'), ValidationError);
    assert.throws(() => normalizeDisplayName({}), ValidationError);
  });

  it('removes control characters before validating display names', () => {
    assert.equal(normalizeDisplayName('\u0000  Алекс\u0007 Иванов  '), 'Алекс Иванов');
  });
});

describe('normalizeChatMessage', () => {
  it('trims a valid message', () => {
    assert.equal(normalizeChatMessage('  Привет  '), 'Привет');
  });

  it('clips long messages to the configured limit', () => {
    const message = 'a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 5);

    assert.equal(normalizeChatMessage(message), 'a'.repeat(MAX_CHAT_MESSAGE_LENGTH));
  });

  it('rejects empty messages', () => {
    assert.throws(() => normalizeChatMessage('   '), ValidationError);
    assert.throws(() => normalizeChatMessage(null), ValidationError);
  });

  it('removes control characters before validating chat messages', () => {
    assert.equal(normalizeChatMessage('\u0000  Привет\u0007 всем  '), 'Привет всем');
  });

  it('keeps HTML as inert text for the UI render boundary to escape', () => {
    assert.equal(normalizeChatMessage('<b>hello</b>'), '<b>hello</b>');
  });
});
