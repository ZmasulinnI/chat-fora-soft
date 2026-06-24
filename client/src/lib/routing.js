const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;
const ROOM_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
const ROOM_ID_LENGTH = 12;

export function parseRoute(pathname) {
  if (pathname === '/') {
    return {
      name: 'start'
    };
  }

  const roomMatch = pathname.match(/^\/room\/([^/]+)$/);

  if (!roomMatch) {
    return {
      name: 'not-found'
    };
  }

  const roomId = decodeURIComponent(roomMatch[1]);

  if (!ROOM_ID_PATTERN.test(roomId)) {
    return {
      name: 'not-found'
    };
  }

  return {
    name: 'room',
    roomId
  };
}

export function buildRoomPath(roomId) {
  if (!ROOM_ID_PATTERN.test(roomId)) {
    throw new Error('Invalid room id');
  }

  return `/room/${encodeURIComponent(roomId)}`;
}

export function generateRoomId(getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)) {
  const bytes = new Uint8Array(ROOM_ID_LENGTH);

  if (getRandomValues) {
    getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return [...bytes].map((byte) => ROOM_ID_ALPHABET[byte % ROOM_ID_ALPHABET.length]).join('');
}
