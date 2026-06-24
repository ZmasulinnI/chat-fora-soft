import { RoomStoreError } from './roomStore.js';
import { ValidationError } from './validators.js';

export function registerRoomLifecycleHandlers(io, roomStore) {
  io.on('connection', (socket) => {
    socket.emit('server:ready', {
      participantId: socket.id
    });

    socket.on('room:join', (payload, callback) => {
      try {
        leaveCurrentRoom({ io, socket, roomStore });

        const result = roomStore.joinRoom({
          roomId: payload?.roomId,
          participantId: socket.id,
          displayName: payload?.displayName,
          media: payload?.media
        });

        socket.join(result.room.id);
        socket.data.roomId = result.room.id;

        callback?.({
          ok: true,
          participantId: socket.id,
          room: result.room
        });

        socket.to(result.room.id).emit('participant:joined', {
          participant: result.participant
        });
        io.to(result.room.id).emit('participants:list', {
          participants: result.room.participants
        });

        const systemMessage = roomStore.appendSystemMessage(
          result.room.id,
          `${result.participant.displayName} присоединился`
        );
        io.to(result.room.id).emit('chat:message', systemMessage);
      } catch (error) {
        callback?.(toSocketErrorResponse(error));
      }
    });

    socket.on('chat:send', (payload, callback) => {
      try {
        const roomId = payload?.roomId ?? socket.data.roomId;
        const message = roomStore.appendUserMessage(roomId, socket.id, payload?.text);

        io.to(roomId).emit('chat:message', message);

        callback?.({
          ok: true,
          message
        });
      } catch (error) {
        callback?.(toSocketErrorResponse(error));
      }
    });

    socket.on('media:update', (payload, callback) => {
      try {
        const roomId = payload?.roomId ?? socket.data.roomId;
        const participant = roomStore.updateParticipantMedia(roomId, socket.id, {
          audioEnabled: payload?.audioEnabled,
          videoEnabled: payload?.videoEnabled
        });
        const room = roomStore.getRoomSnapshot(roomId);

        io.to(roomId).emit('participant:media-updated', {
          participant
        });
        io.to(roomId).emit('participants:list', {
          participants: room.participants
        });

        callback?.({
          ok: true,
          participant
        });
      } catch (error) {
        callback?.(toSocketErrorResponse(error));
      }
    });

    for (const eventName of ['webrtc:offer', 'webrtc:answer', 'webrtc:ice-candidate']) {
      socket.on(eventName, (payload, callback) => {
        try {
          const relayedPayload = relayWebRtcSignal({ io, socket, roomStore, eventName, payload });

          callback?.({
            ok: true,
            relayed: relayedPayload
          });
        } catch (error) {
          callback?.(toSocketErrorResponse(error));
        }
      });
    }

    socket.on('room:leave', (_payload, callback) => {
      const result = leaveCurrentRoom({ io, socket, roomStore });

      callback?.({
        ok: true,
        roomDeleted: result.roomDeleted
      });
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom({ io, socket, roomStore });
    });
  });
}

export function relayWebRtcSignal({ io, socket, roomStore, eventName, payload }) {
  const roomId = payload?.roomId ?? socket.data.roomId;
  const targetParticipantId = validateTargetParticipantId(payload?.to);

  if (!roomStore.hasParticipant(roomId, socket.id)) {
    throw new RoomStoreError('ROOM_NOT_JOINED', 'Участник не находится в комнате');
  }

  if (!roomStore.hasParticipant(roomId, targetParticipantId)) {
    throw new RoomStoreError('PARTICIPANT_NOT_FOUND', 'Получатель не найден');
  }

  const relayedPayload = {
    roomId,
    from: socket.id,
    to: targetParticipantId,
    payload: payload?.payload ?? null
  };

  io.to(targetParticipantId).emit(eventName, relayedPayload);

  return relayedPayload;
}

export function leaveCurrentRoom({ io, socket, roomStore }) {
  const roomId = socket.data.roomId;

  if (!roomId) {
    return {
      roomDeleted: false,
      participant: null,
      room: null
    };
  }

  const participant = roomStore.getParticipant(roomId, socket.id);
  const systemMessage = participant
    ? roomStore.appendSystemMessage(roomId, `${participant.displayName} покинул комнату`)
    : null;
  const result = roomStore.leaveRoom(roomId, socket.id);

  socket.leave(roomId);
  delete socket.data.roomId;

  if (result.participant) {
    socket.to(roomId).emit('participant:left', {
      participantId: result.participant.id,
      participant: result.participant
    });

    if (result.room) {
      if (systemMessage) {
        io.to(roomId).emit('chat:message', systemMessage);
      }

      io.to(roomId).emit('participants:list', {
        participants: result.room.participants
      });
    }
  }

  return result;
}

export function toSocketErrorResponse(error) {
  if (error instanceof ValidationError || error instanceof RoomStoreError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  return {
    ok: false,
    code: 'SERVER_ERROR',
    message: 'Внутренняя ошибка сервера'
  };
}

function validateTargetParticipantId(participantId) {
  if (typeof participantId !== 'string' || !participantId.trim()) {
    throw new RoomStoreError('VALIDATION_ERROR', 'Некорректный получатель');
  }

  return participantId.trim();
}
