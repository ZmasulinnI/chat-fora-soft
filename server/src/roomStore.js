import { randomUUID } from 'node:crypto';
import { normalizeChatMessage, normalizeDisplayName, validateRoomId } from './validators.js';

export const MAX_PARTICIPANTS_PER_ROOM = 4;

export class RoomStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RoomStoreError';
    this.code = code;
    this.details = details;
  }
}

export class RoomStore {
  constructor({ now = () => Date.now(), createId = randomUUID } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.createId = createId;
  }

  joinRoom({ roomId, participantId, displayName, media = {} }) {
    const normalizedRoomId = validateRoomId(roomId);
    const normalizedParticipantId = this.#validateParticipantId(participantId);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const room = this.#getOrCreateRoom(normalizedRoomId);

    if (!room.participants.has(normalizedParticipantId)) {
      this.#assertRoomHasCapacity(room);
    }

    this.#assertDisplayNameAvailable(room, normalizedParticipantId, normalizedDisplayName);

    const participant = {
      id: normalizedParticipantId,
      displayName: normalizedDisplayName,
      media: normalizeMediaState(media),
      joinedAt: this.now()
    };

    room.participants.set(normalizedParticipantId, participant);

    return {
      participant: copyParticipant(participant),
      room: this.getRoomSnapshot(normalizedRoomId)
    };
  }

  leaveRoom(roomId, participantId) {
    const normalizedRoomId = validateRoomId(roomId);
    const normalizedParticipantId = this.#validateParticipantId(participantId);
    const room = this.rooms.get(normalizedRoomId);

    if (!room || !room.participants.has(normalizedParticipantId)) {
      return {
        roomDeleted: false,
        participant: null,
        room: room ? this.getRoomSnapshot(normalizedRoomId) : null
      };
    }

    const participant = room.participants.get(normalizedParticipantId);
    room.participants.delete(normalizedParticipantId);

    if (room.participants.size === 0) {
      this.rooms.delete(normalizedRoomId);

      return {
        roomDeleted: true,
        participant: copyParticipant(participant),
        room: null
      };
    }

    return {
      roomDeleted: false,
      participant: copyParticipant(participant),
      room: this.getRoomSnapshot(normalizedRoomId)
    };
  }

  getRoomSnapshot(roomId) {
    const normalizedRoomId = validateRoomId(roomId);
    const room = this.rooms.get(normalizedRoomId);

    if (!room) {
      return null;
    }

    return {
      id: room.id,
      participants: [...room.participants.values()].map(copyParticipant),
      messages: room.messages.map(copyMessage),
      createdAt: room.createdAt
    };
  }

  getParticipant(roomId, participantId) {
    const normalizedRoomId = validateRoomId(roomId);
    const normalizedParticipantId = this.#validateParticipantId(participantId);
    const participant = this.rooms.get(normalizedRoomId)?.participants.get(normalizedParticipantId);

    return participant ? copyParticipant(participant) : null;
  }

  updateParticipantMedia(roomId, participantId, media) {
    const normalizedRoomId = validateRoomId(roomId);
    const normalizedParticipantId = this.#validateParticipantId(participantId);
    const room = this.rooms.get(normalizedRoomId);
    const participant = room?.participants.get(normalizedParticipantId);

    if (!participant) {
      throw new RoomStoreError('ROOM_NOT_JOINED', 'Участник не находится в комнате');
    }

    participant.media = {
      ...participant.media,
      ...normalizeMediaState(media)
    };

    return copyParticipant(participant);
  }

  appendUserMessage(roomId, participantId, text) {
    const normalizedRoomId = validateRoomId(roomId);
    const normalizedParticipantId = this.#validateParticipantId(participantId);
    const room = this.rooms.get(normalizedRoomId);
    const participant = room?.participants.get(normalizedParticipantId);

    if (!participant) {
      throw new RoomStoreError('ROOM_NOT_JOINED', 'Участник не находится в комнате');
    }

    const message = {
      id: this.createId(),
      type: 'user',
      senderId: participant.id,
      senderName: participant.displayName,
      text: normalizeChatMessage(text),
      createdAt: this.now()
    };

    room.messages.push(message);

    return copyMessage(message);
  }

  appendSystemMessage(roomId, text) {
    const normalizedRoomId = validateRoomId(roomId);
    const room = this.rooms.get(normalizedRoomId);

    if (!room) {
      throw new RoomStoreError('ROOM_NOT_FOUND', 'Комната не найдена');
    }

    const message = {
      id: this.createId(),
      type: 'system',
      text: normalizeChatMessage(text),
      createdAt: this.now()
    };

    room.messages.push(message);

    return copyMessage(message);
  }

  hasParticipant(roomId, participantId) {
    const normalizedRoomId = validateRoomId(roomId);
    const normalizedParticipantId = this.#validateParticipantId(participantId);

    return this.rooms.get(normalizedRoomId)?.participants.has(normalizedParticipantId) ?? false;
  }

  #getOrCreateRoom(roomId) {
    const existingRoom = this.rooms.get(roomId);

    if (existingRoom) {
      return existingRoom;
    }

    const room = {
      id: roomId,
      participants: new Map(),
      messages: [],
      createdAt: this.now()
    };

    this.rooms.set(roomId, room);

    return room;
  }

  #assertRoomHasCapacity(room) {
    if (room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) {
      throw new RoomStoreError('ROOM_FULL', 'Комната заполнена', {
        roomId: room.id,
        limit: MAX_PARTICIPANTS_PER_ROOM
      });
    }
  }

  #assertDisplayNameAvailable(room, participantId, displayName) {
    const isNameTaken = [...room.participants.values()].some(
      (participant) => participant.id !== participantId && participant.displayName === displayName
    );

    if (isNameTaken) {
      throw new RoomStoreError('DISPLAY_NAME_TAKEN', 'Этот никнейм уже занят в комнате', {
        roomId: room.id,
        displayName
      });
    }
  }

  #validateParticipantId(participantId) {
    if (typeof participantId !== 'string' || !participantId.trim()) {
      throw new RoomStoreError('VALIDATION_ERROR', 'Некорректный идентификатор участника');
    }

    return participantId.trim();
  }
}

export function normalizeMediaState(media = {}) {
  return {
    audioEnabled: media.audioEnabled !== false,
    videoEnabled: media.videoEnabled !== false
  };
}

function copyParticipant(participant) {
  return {
    id: participant.id,
    displayName: participant.displayName,
    media: { ...participant.media },
    joinedAt: participant.joinedAt
  };
}

function copyMessage(message) {
  return {
    ...message
  };
}
