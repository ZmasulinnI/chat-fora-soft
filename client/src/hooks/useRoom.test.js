import { describe, expect, it } from 'vitest';
import { initialRoomState, roomReducer } from './useRoom.js';

describe('roomReducer', () => {
  it('stores participant id and room state after join', () => {
    const state = roomReducer(initialRoomState, {
      type: 'joined',
      participantId: 'socket-1',
      room: {
        participants: [{ id: 'socket-1', displayName: 'Алекс' }],
        messages: [{ id: 'message-1', type: 'system', text: 'Алекс присоединился' }]
      }
    });

    expect(state.status).toBe('joined');
    expect(state.participantId).toBe('socket-1');
    expect(state.participants).toHaveLength(1);
    expect(state.messages).toHaveLength(1);
  });

  it('updates participants list', () => {
    const state = roomReducer(initialRoomState, {
      type: 'participants:list',
      participants: [{ id: 'socket-2', displayName: 'Мария' }]
    });

    expect(state.participants).toEqual([{ id: 'socket-2', displayName: 'Мария' }]);
  });

  it('appends unique chat messages only once', () => {
    const firstState = roomReducer(initialRoomState, {
      type: 'chat:message',
      message: { id: 'message-1', type: 'user', text: 'Привет' }
    });
    const secondState = roomReducer(firstState, {
      type: 'chat:message',
      message: { id: 'message-1', type: 'user', text: 'Привет' }
    });

    expect(secondState.messages).toHaveLength(1);
  });

  it('maps ROOM_FULL to a dedicated status', () => {
    const state = roomReducer(initialRoomState, {
      type: 'error',
      code: 'ROOM_FULL',
      message: 'Комната заполнена'
    });

    expect(state.status).toBe('room-full');
    expect(state.error).toBe('Комната заполнена');
  });

  it('updates participant media state', () => {
    const joinedState = roomReducer(initialRoomState, {
      type: 'joined',
      participantId: 'socket-1',
      room: {
        participants: [
          {
            id: 'socket-1',
            displayName: 'Алекс',
            media: { audioEnabled: true, videoEnabled: true }
          }
        ],
        messages: []
      }
    });
    const updatedState = roomReducer(joinedState, {
      type: 'participant:media-updated',
      participant: {
        id: 'socket-1',
        displayName: 'Алекс',
        media: { audioEnabled: false, videoEnabled: true }
      }
    });

    expect(updatedState.participants[0].media).toEqual({
      audioEnabled: false,
      videoEnabled: true
    });
  });
});
