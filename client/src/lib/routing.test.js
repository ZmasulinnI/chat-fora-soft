import { describe, expect, it } from 'vitest';
import { buildRoomPath, generateRoomId, parseRoute } from './routing.js';

describe('parseRoute', () => {
  it('parses the start route', () => {
    expect(parseRoute('/')).toEqual({ name: 'start' });
  });

  it('parses a room route', () => {
    expect(parseRoute('/room/abc_123-DEF')).toEqual({
      name: 'room',
      roomId: 'abc_123-DEF'
    });
  });

  it('rejects unknown or unsafe routes', () => {
    expect(parseRoute('/rooms/abc')).toEqual({ name: 'not-found' });
    expect(parseRoute('/room/..%2Fsecret')).toEqual({ name: 'not-found' });
  });
});

describe('buildRoomPath', () => {
  it('builds a room URL path', () => {
    expect(buildRoomPath('room_123-Abc')).toBe('/room/room_123-Abc');
  });

  it('rejects invalid room ids', () => {
    expect(() => buildRoomPath('../room')).toThrow('Invalid room id');
  });
});

describe('generateRoomId', () => {
  it('creates a URL-safe id', () => {
    const id = generateRoomId((bytes) => bytes.fill(7));

    expect(id).toMatch(/^[a-zA-Z0-9_-]{12}$/);
  });
});
