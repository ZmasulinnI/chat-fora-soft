import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_PARTICIPANTS_PER_ROOM, RoomStore, RoomStoreError } from './roomStore.js';

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

  it('allows duplicate display names by using participant ids internally', () => {
    const store = createStore();

    store.joinRoom({ roomId: 'room-1', participantId: 'socket-1', displayName: 'Алекс' });
    store.joinRoom({ roomId: 'room-1', participantId: 'socket-2', displayName: 'Алекс' });

    const snapshot = store.getRoomSnapshot('room-1');

    assert.equal(snapshot.participants.length, 2);
    assert.deepEqual(
      snapshot.participants.map((participant) => participant.id),
      ['socket-1', 'socket-2']
    );
    assert.deepEqual(
      snapshot.participants.map((participant) => participant.displayName),
      ['Алекс', 'Алекс']
    );
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

  it('treats leaving an unknown room as a no-op', () => {
    const store = createStore();

    assert.deepEqual(store.leaveRoom('room-1', 'socket-1'), {
      roomDeleted: false,
      participant: null,
      room: null
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
});
