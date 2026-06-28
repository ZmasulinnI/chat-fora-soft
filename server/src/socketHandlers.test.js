import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { io as createClient } from 'socket.io-client';
import { Server } from 'socket.io';
import { RoomStore } from './roomStore.js';
import { registerRoomLifecycleHandlers } from './socketHandlers.js';

describe('room lifecycle socket handlers', () => {
  it('joins a room and broadcasts participant updates', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      const firstJoin = await emitWithAck(first, 'room:join', {
        roomId: 'room-1',
        displayName: 'Алекс',
        media: { audioEnabled: true, videoEnabled: false }
      });

      assert.equal(firstJoin.ok, true);
      assert.equal(firstJoin.participantId, first.id);
      assert.equal(firstJoin.room.participants.length, 1);

      const joinedEvent = waitForEvent(first, 'participant:joined');
      const participantsEvent = waitForEvent(first, 'participants:list');

      const secondJoin = await emitWithAck(second, 'room:join', {
        roomId: 'room-1',
        displayName: 'Мария'
      });

      assert.equal(secondJoin.ok, true);
      assert.equal(secondJoin.room.participants.length, 2);
      assert.equal((await joinedEvent).participant.id, second.id);
      assert.equal((await participantsEvent).participants.length, 2);
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('rejects the fifth participant with ROOM_FULL', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      for (let i = 1; i <= 5; i += 1) {
        const client = await connectClient(server.url);
        clients.push(client);
      }

      for (let i = 0; i < 4; i += 1) {
        const response = await emitWithAck(clients[i], 'room:join', {
          roomId: 'room-1',
          displayName: `User ${i + 1}`
        });

        assert.equal(response.ok, true);
      }

      const response = await emitWithAck(clients[4], 'room:join', {
        roomId: 'room-1',
        displayName: 'User 5'
      });

      assert.equal(response.ok, false);
      assert.equal(response.code, 'ROOM_FULL');
      assert.equal(response.message, 'Комната заполнена');
      assert.equal(server.roomStore.getRoomSnapshot('room-1').participants.length, 4);
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('rejects duplicate display names with DISPLAY_NAME_TAKEN', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      const firstJoin = await emitWithAck(first, 'room:join', {
        roomId: 'room-1',
        displayName: 'Алекс'
      });
      const duplicateJoin = await emitWithAck(second, 'room:join', {
        roomId: 'room-1',
        displayName: 'Алекс'
      });

      assert.equal(firstJoin.ok, true);
      assert.equal(duplicateJoin.ok, false);
      assert.equal(duplicateJoin.code, 'DISPLAY_NAME_TAKEN');
      assert.equal(duplicateJoin.message, 'Этот никнейм уже занят в комнате');
      assert.equal(server.roomStore.getRoomSnapshot('room-1').participants.length, 1);
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('leaves a room and broadcasts participant:left', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });

      const leftEvent = waitForEvent(second, 'participant:left');
      const participantsEvent = waitForEvent(second, 'participants:list');
      const leaveResponse = await emitWithAck(first, 'room:leave', {});

      assert.equal(leaveResponse.ok, true);
      assert.equal(leaveResponse.roomDeleted, false);
      assert.equal((await leftEvent).participantId, first.id);
      assert.equal((await participantsEvent).participants.length, 1);
      assert.equal(server.roomStore.getRoomSnapshot('room-1').participants[0].id, second.id);
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('treats disconnect as leaving the room', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });

      const leftEvent = waitForEvent(second, 'participant:left');
      const firstParticipantId = first.id;
      first.disconnect();

      assert.equal((await leftEvent).participantId, firstParticipantId);
      assert.equal(server.roomStore.getRoomSnapshot('room-1').participants.length, 1);
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('keeps participant join and leave broadcasts scoped to the room', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      const outsider = await connectClient(server.url);
      clients.push(first, second, outsider);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(outsider, 'room:join', { roomId: 'room-2', displayName: 'Никита' });

      const firstJoinedEvent = waitForEvent(first, 'participant:joined');
      const outsiderNoJoinedEvent = waitForNoEvent(outsider, 'participant:joined');

      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });

      assert.equal((await firstJoinedEvent).participant.id, second.id);
      await outsiderNoJoinedEvent;

      const firstLeftEvent = waitForEvent(first, 'participant:left');
      const outsiderNoLeftEvent = waitForNoEvent(outsider, 'participant:left');

      await emitWithAck(second, 'room:leave', {});

      assert.equal((await firstLeftEvent).participantId, second.id);
      await outsiderNoLeftEvent;
    } finally {
      await closeTestServer(server, clients);
    }
  });
});

describe('chat socket handlers', () => {
  it('broadcasts user chat messages to all room participants', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });

      const firstMessageEvent = waitForMatchingEvent(
        first,
        'chat:message',
        (message) => message.type === 'user' && message.text === 'Привет'
      );
      const secondMessageEvent = waitForMatchingEvent(
        second,
        'chat:message',
        (message) => message.type === 'user' && message.text === 'Привет'
      );

      const response = await emitWithAck(first, 'chat:send', {
        roomId: 'room-1',
        text: '  Привет  '
      });

      assert.equal(response.ok, true);
      assert.equal(response.message.senderId, first.id);
      assert.equal(response.message.senderName, 'Алекс');
      assert.equal(response.message.text, 'Привет');
      assert.equal((await firstMessageEvent).id, response.message.id);
      assert.equal((await secondMessageEvent).id, response.message.id);
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('rejects empty chat messages', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      clients.push(first);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });

      const response = await emitWithAck(first, 'chat:send', {
        roomId: 'room-1',
        text: '   '
      });

      assert.equal(response.ok, false);
      assert.equal(response.code, 'VALIDATION_ERROR');
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('returns existing room message history to late participants', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(first, 'chat:send', {
        roomId: 'room-1',
        text: 'Сообщение до входа'
      });

      const secondJoin = await emitWithAck(second, 'room:join', {
        roomId: 'room-1',
        displayName: 'Мария'
      });

      assert.equal(secondJoin.ok, true);
      assert.equal(
        secondJoin.room.messages.some(
          (message) => message.type === 'user' && message.text === 'Сообщение до входа'
        ),
        true
      );
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('emits system chat messages when participants join and leave', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });

      const joinSystemMessage = waitForMatchingEvent(
        first,
        'chat:message',
        (message) => message.type === 'system' && message.text === 'Мария присоединился'
      );

      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });

      assert.equal((await joinSystemMessage).text, 'Мария присоединился');

      const leaveSystemMessage = waitForMatchingEvent(
        second,
        'chat:message',
        (message) => message.type === 'system' && message.text === 'Алекс покинул комнату'
      );

      await emitWithAck(first, 'room:leave', {});

      assert.equal((await leaveSystemMessage).text, 'Алекс покинул комнату');
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('does not deliver room chat messages to participants in another room', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      const outsider = await connectClient(server.url);
      clients.push(first, second, outsider);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });
      await emitWithAck(outsider, 'room:join', { roomId: 'room-2', displayName: 'Никита' });

      const firstMessageEvent = waitForMatchingEvent(
        first,
        'chat:message',
        (message) => message.type === 'user' && message.text === 'Только room-1'
      );
      const secondMessageEvent = waitForMatchingEvent(
        second,
        'chat:message',
        (message) => message.type === 'user' && message.text === 'Только room-1'
      );
      const outsiderNoMessageEvent = waitForMatchingNoEvent(
        outsider,
        'chat:message',
        (message) => message.type === 'user' && message.text === 'Только room-1'
      );

      const response = await emitWithAck(first, 'chat:send', {
        roomId: 'room-1',
        text: 'Только room-1'
      });

      assert.equal(response.ok, true);
      assert.equal((await firstMessageEvent).id, response.message.id);
      assert.equal((await secondMessageEvent).id, response.message.id);
      await outsiderNoMessageEvent;
    } finally {
      await closeTestServer(server, clients);
    }
  });
});

describe('WebRTC signaling relay handlers', () => {
  it('relays offer, answer and ICE candidates to the target participant', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });

      const offerEvent = waitForEvent(second, 'webrtc:offer');
      const offerResponse = await emitWithAck(first, 'webrtc:offer', {
        roomId: 'room-1',
        to: second.id,
        payload: { type: 'offer', sdp: 'offer-sdp' }
      });

      assert.equal(offerResponse.ok, true);
      assert.deepEqual(await offerEvent, {
        roomId: 'room-1',
        from: first.id,
        to: second.id,
        payload: { type: 'offer', sdp: 'offer-sdp' }
      });

      const answerEvent = waitForEvent(first, 'webrtc:answer');
      const answerResponse = await emitWithAck(second, 'webrtc:answer', {
        roomId: 'room-1',
        to: first.id,
        payload: { type: 'answer', sdp: 'answer-sdp' }
      });

      assert.equal(answerResponse.ok, true);
      assert.deepEqual(await answerEvent, {
        roomId: 'room-1',
        from: second.id,
        to: first.id,
        payload: { type: 'answer', sdp: 'answer-sdp' }
      });

      const iceEvent = waitForEvent(second, 'webrtc:ice-candidate');
      const iceResponse = await emitWithAck(first, 'webrtc:ice-candidate', {
        roomId: 'room-1',
        to: second.id,
        payload: { candidate: 'candidate:1 1 udp 1 127.0.0.1 999 typ host' }
      });

      assert.equal(iceResponse.ok, true);
      assert.deepEqual(await iceEvent, {
        roomId: 'room-1',
        from: first.id,
        to: second.id,
        payload: { candidate: 'candidate:1 1 udp 1 127.0.0.1 999 typ host' }
      });
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('rejects signaling from a socket that has not joined the room', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });

      const response = await emitWithAck(first, 'webrtc:offer', {
        roomId: 'room-1',
        to: second.id,
        payload: { type: 'offer', sdp: 'offer-sdp' }
      });

      assert.equal(response.ok, false);
      assert.equal(response.code, 'ROOM_NOT_JOINED');
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('rejects signaling to a participant outside the room', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(second, 'room:join', { roomId: 'room-2', displayName: 'Мария' });

      const response = await emitWithAck(first, 'webrtc:offer', {
        roomId: 'room-1',
        to: second.id,
        payload: { type: 'offer', sdp: 'offer-sdp' }
      });

      assert.equal(response.ok, false);
      assert.equal(response.code, 'PARTICIPANT_NOT_FOUND');
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('relays WebRTC signaling only to the requested target participant', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      const third = await connectClient(server.url);
      clients.push(first, second, third);

      await emitWithAck(first, 'room:join', { roomId: 'room-1', displayName: 'Алекс' });
      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });
      await emitWithAck(third, 'room:join', { roomId: 'room-1', displayName: 'Никита' });

      const targetOfferEvent = waitForEvent(second, 'webrtc:offer');
      const thirdNoOfferEvent = waitForNoEvent(third, 'webrtc:offer');

      const response = await emitWithAck(first, 'webrtc:offer', {
        roomId: 'room-1',
        to: second.id,
        payload: { type: 'offer', sdp: 'target-only-offer' }
      });

      assert.equal(response.ok, true);
      assert.deepEqual(await targetOfferEvent, {
        roomId: 'room-1',
        from: first.id,
        to: second.id,
        payload: { type: 'offer', sdp: 'target-only-offer' }
      });
      await thirdNoOfferEvent;
    } finally {
      await closeTestServer(server, clients);
    }
  });
});

describe('media state socket handlers', () => {
  it('updates media state and broadcasts it to room participants', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      const second = await connectClient(server.url);
      clients.push(first, second);

      await emitWithAck(first, 'room:join', {
        roomId: 'room-1',
        displayName: 'Алекс',
        media: { audioEnabled: true, videoEnabled: true }
      });
      await emitWithAck(second, 'room:join', { roomId: 'room-1', displayName: 'Мария' });

      const mediaEvent = waitForEvent(second, 'participant:media-updated');
      const participantsEvent = waitForMatchingEvent(
        second,
        'participants:list',
        ({ participants }) =>
          participants.some(
            (participant) =>
              participant.id === first.id &&
              participant.media.audioEnabled === false &&
              participant.media.videoEnabled === true
          )
      );

      const response = await emitWithAck(first, 'media:update', {
        roomId: 'room-1',
        audioEnabled: false,
        videoEnabled: true
      });

      assert.equal(response.ok, true);
      assert.equal(response.participant.media.audioEnabled, false);
      assert.equal((await mediaEvent).participant.id, first.id);
      assert.equal((await participantsEvent).participants.length, 2);
    } finally {
      await closeTestServer(server, clients);
    }
  });

  it('rejects media updates from sockets outside the room', async () => {
    const server = await createTestServer();
    const clients = [];

    try {
      const first = await connectClient(server.url);
      clients.push(first);

      const response = await emitWithAck(first, 'media:update', {
        roomId: 'room-1',
        audioEnabled: false,
        videoEnabled: false
      });

      assert.equal(response.ok, false);
      assert.equal(response.code, 'ROOM_NOT_JOINED');
    } finally {
      await closeTestServer(server, clients);
    }
  });
});

async function createTestServer() {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: {
      origin: '*'
    }
  });
  const roomStore = new RoomStore();

  registerRoomLifecycleHandlers(io, roomStore);

  await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const { port } = httpServer.address();

  return {
    httpServer,
    io,
    roomStore,
    url: `http://127.0.0.1:${port}`
  };
}

async function closeTestServer(server, clients) {
  for (const client of clients) {
    client.disconnect();
  }

  await new Promise((resolve) => server.io.close(resolve));
  await new Promise((resolve) => server.httpServer.close(resolve));
}

async function connectClient(url) {
  const client = createClient(url, {
    forceNew: true,
    transports: ['websocket'],
    timeout: 1000
  });

  await waitForEvent(client, 'connect');

  return client;
}

function emitWithAck(client, eventName, payload) {
  return new Promise((resolve, reject) => {
    client.timeout(1000).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}

function waitForEvent(client, eventName) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      client.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 1000);

    function onEvent(payload) {
      clearTimeout(timeoutId);
      resolve(payload);
    }

    client.once(eventName, onEvent);
  });
}

function waitForMatchingEvent(client, eventName, predicate) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      client.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for matching ${eventName}`));
    }, 1000);

    function onEvent(payload) {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeoutId);
      client.off(eventName, onEvent);
      resolve(payload);
    }

    client.on(eventName, onEvent);
  });
}

function waitForNoEvent(client, eventName, timeoutMs = 150) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      client.off(eventName, onEvent);
      resolve();
    }, timeoutMs);

    function onEvent(payload) {
      clearTimeout(timeoutId);
      reject(new Error(`Unexpected ${eventName}: ${JSON.stringify(payload)}`));
    }

    client.once(eventName, onEvent);
  });
}

function waitForMatchingNoEvent(client, eventName, predicate, timeoutMs = 150) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      client.off(eventName, onEvent);
      resolve();
    }, timeoutMs);

    function onEvent(payload) {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeoutId);
      client.off(eventName, onEvent);
      reject(new Error(`Unexpected matching ${eventName}: ${JSON.stringify(payload)}`));
    }

    client.on(eventName, onEvent);
  });
}
