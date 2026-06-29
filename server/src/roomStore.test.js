import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_PARTICIPANTS_PER_ROOM,
  RoomStore,
  RoomStoreError,
  normalizeMediaState
} from './roomStore.js';

function createStore() {
  let now = 1000;
  let id = 0;

  return new RoomStore({
    now: () => now++,
    createId: () => `message-${++id}`
  });
}

describe('RoomStore.joinRoom', () => {
  it('creates a room and adds the first participant', () => {
    const store = createStore();
    const result = store.joinRoom({
      roomId: 'room-1',
      participantId: 'socket-1',
      displayName: 'Алекс',
      media: { audioEnabled: true, videoEnabled: false }
    });

    assert.equal(result.participant.id, 'socket-1');
    assert.equal(result.participant.displayName, 'Алекс');
    assert.deepEqual(result.participant.media, {
      audioEnabled: true,
      videoEnabled: false
    });
    assert.equal(result.room.id, 'room-1');
    assert.equal(result.room.participants.length, 1);
    assert.deepEqual(result.room.messages, []);
  });

  it('rejects duplicate display names inside the same room', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });

    assert.throws(
      () => store.joinRoom({ roomId: 'room-1', participantId: 'socket-2', displayName: 'Алекс' }),
      (error) =>
        error instanceof RoomStoreError &&
        error.code === 'DISPLAY_NAME_TAKEN' &&
        error.details.roomId === 'room-1' &&
        error.details.displayName === 'Алекс'
    );

    const snapshot = store.getRoomSnapshot('room-1');

    assert.equal(snapshot.participants.length, 1);
    assert.deepEqual(
      snapshot.participants.map((participant) => participant.id),
      ['socket-1']
    );
  });

  it('allows the same participant to refresh its own display name', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });
    const result = store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });

    assert.equal(result.room.participants.length, 1);
    assert.equal(result.participant.displayName, 'Алекс');
  });

  it('rejects the fifth participant', () => {
    const store = createStore();

    for (let i = 1; i <= MAX_PARTICIPANTS_PER_ROOM; i += 1) {
      store.joinRoom({ roomId: 'room-1', participantId: `socket-${i}`, displayName: `User ${i}` });
    }

    assert.throws(
      () => store.joinRoom({ roomId: 'room-1', participantId: 'socket-5', displayName: 'User 5' }),
      (error) => error instanceof RoomStoreError && error.code === 'ROOM_FULL'
    );

    assert.equal(store.getRoomSnapshot('room-1').participants.length, MAX_PARTICIPANTS_PER_ROOM);
  });

  it('keeps the last available slot atomic for sequential join attempts', () => {
    const store = createStore();

    for (let i = 1; i < MAX_PARTICIPANTS_PER_ROOM; i += 1) {
      store.joinRoom({ roomId: 'room-1', participantId: `socket-${i}`, displayName: `User ${i}` });
    }

    const winningJoin = store.joinRoom({
      roomId: 'room-1',
      participantId: 'socket-4',
      displayName: 'Winner'
    });

    assert.equal(winningJoin.room.participants.length, MAX_PARTICIPANTS_PER_ROOM);
    assert.throws(
      () => store.joinRoom({ roomId: 'room-1', participantId: 'socket-5', displayName: 'Too Late' }),
      (error) => error instanceof RoomStoreError && error.code === 'ROOM_FULL'
    );
    assert.deepEqual(
      store.getRoomSnapshot('room-1').participants.map((participant) => participant.id),
      ['socket-1', 'socket-2', 'socket-3', 'socket-4']
    );
  });

  it('includes room limit details when rejecting an over-capacity join', () => {
    const store = createStore();

    for (let i = 1; i <= MAX_PARTICIPANTS_PER_ROOM; i += 1) {
      store.joinRoom({ roomId: 'room-1', participantId: `socket-${i}`, displayName: `User ${i}` });
    }

    assert.throws(
      () => store.joinRoom({ roomId: 'room-1', participantId: 'socket-5', displayName: 'User 5' }),
      (error) =>
        error instanceof RoomStoreError &&
        error.code === 'ROOM_FULL' &&
        error.details.roomId === 'room-1' &&
        error.details.limit === MAX_PARTICIPANTS_PER_ROOM
    );
  });
});

describe('RoomStore.leaveRoom', () => {
  it('removes a participant and keeps a non-empty room alive', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });
    store.joinRoom({ roomId: 'room-1', participantId: 'socket-2', displayName: 'Мария' });

    const result = store.leaveRoom('room-1', 'socket-1');

    assert.equal(result.roomDeleted, false);
    assert.equal(result.participant.id, 'socket-1');
    assert.equal(result.room.participants.length, 1);
    assert.equal(result.room.participants[0].id, 'socket-2');
  });

  it('deletes the room and its message history after the last participant leaves', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });
    store.appendUserMessage('room-1', 'socket-1', 'Привет');

    const result = store.leaveRoom('room-1', 'socket-1');

    assert.equal(result.roomDeleted, true);
    assert.equal(result.room, null);
    assert.equal(store.getRoomSnapshot('room-1'), null);
  });

  it('keeps message history while at least one participant remains', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });
    store.joinRoom({ roomId: 'room-1', participantId: 'socket-2', displayName: 'Мария' });
    store.appendUserMessage('room-1', 'socket-1', 'Привет');

    store.leaveRoom('room-1', 'socket-1');

    const snapshot = store.getRoomSnapshot('room-1');

    assert.equal(snapshot.participants.length, 1);
    assert.equal(snapshot.messages.length, 1);
    assert.equal(snapshot.messages[0].text, 'Привет');
  });

  it('treats leaving an unknown room as a no-op', () => {
    const store = createStore();

    assert.deepEqual(store.leaveRoom('room-1', 'socket-1'), {
      roomDeleted: false,
      participant: null,
      room: null
    });
  });
});

describe('RoomStore.isDisplayNameAvailable', () => {
  it('treats display names in missing rooms as available', () => {
    const store = createStore();

    assert.deepEqual(store.isDisplayNameAvailable('room-1', ' Алекс '), {
      available: true,
      displayName: 'Алекс'
    });
  });

  it('detects an occupied display name before joining', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });

    assert.deepEqual(store.isDisplayNameAvailable('room-1', 'Алекс'), {
      available: false,
      displayName: 'Алекс'
    });
    assert.deepEqual(store.isDisplayNameAvailable('room-1', 'Мария'), {
      available: true,
      displayName: 'Мария'
    });
  });
});

describe('RoomStore messages and media', () => {
  it('stores user messages for the lifetime of the room', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });
    const message = store.appendUserMessage('room-1', 'socket-1', '  Привет  ');

    assert.deepEqual(message, {
      id: 'message-1',
      type: 'user',
      senderId: 'socket-1',
      senderName: 'Алекс',
      text: 'Привет',
      createdAt: 1002
    });
    assert.deepEqual(store.getRoomSnapshot('room-1').messages, [message]);
  });

  it('stores system messages', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });
    const message = store.appendSystemMessage('room-1', 'Алекс присоединился');

    assert.equal(message.type, 'system');
    assert.equal(message.text, 'Алекс присоединился');
    assert.equal(store.getRoomSnapshot('room-1').messages.length, 1);
  });

  it('updates participant media state', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });
    const participant = store.updateParticipantMedia('room-1', 'socket-1', {
      audioEnabled: false,
      videoEnabled: true
    });

    assert.deepEqual(participant.media, {
      audioEnabled: false,
      videoEnabled: true
    });
  });

  it('rejects messages from participants outside the room', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });

    assert.throws(
      () => store.appendUserMessage('room-1', 'socket-2', 'Привет'),
      (error) => error instanceof RoomStoreError && error.code === 'ROOM_NOT_JOINED'
    );
  });

  it('returns defensive copies for participants and messages', () => {
    const store = createStore();

    store.joinRoom({
      roomId: 'room-1',
      participantId: 'socket-1',
      displayName: 'Алекс',
      media: { audioEnabled: true, videoEnabled: true }
    });
    store.appendUserMessage('room-1', 'socket-1', 'Привет');

    const snapshot = store.getRoomSnapshot('room-1');
    snapshot.participants[0].displayName = 'Changed';
    snapshot.participants[0].media.audioEnabled = false;
    snapshot.messages[0].text = 'Changed';

    const nextSnapshot = store.getRoomSnapshot('room-1');

    assert.equal(nextSnapshot.participants[0].displayName, 'Алекс');
    assert.deepEqual(nextSnapshot.participants[0].media, {
      audioEnabled: true,
      videoEnabled: true
    });
    assert.equal(nextSnapshot.messages[0].text, 'Привет');
  });
});

describe('normalizeMediaState', () => {
  it('defaults missing media flags to enabled', () => {
    assert.deepEqual(normalizeMediaState({}), {
      audioEnabled: true,
      videoEnabled: true
    });
  });

  it('normalizes explicit false flags and treats other values as enabled', () => {
    assert.deepEqual(normalizeMediaState({ audioEnabled: false, videoEnabled: false }), {
      audioEnabled: false,
      videoEnabled: false
    });
    assert.deepEqual(normalizeMediaState({ audioEnabled: 0, videoEnabled: null }), {
      audioEnabled: true,
      videoEnabled: true
    });
  });
});
