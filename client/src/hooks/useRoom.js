import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000';

export const initialRoomState = {
  status: 'idle',
  participantId: '',
  participants: [],
  messages: [],
  error: ''
};

export function roomReducer(state, action) {
  switch (action.type) {
    case 'connecting':
      return {
        ...initialRoomState,
        status: 'connecting'
      };
    case 'joined':
      return {
        ...state,
        status: 'joined',
        participantId: action.participantId,
        participants: action.room.participants,
        messages: action.room.messages,
        error: ''
      };
    case 'participants:list':
      return {
        ...state,
        participants: action.participants
      };
    case 'participant:media-updated':
      return {
        ...state,
        participants: state.participants.map((participant) =>
          participant.id === action.participant.id ? action.participant : participant
        )
      };
    case 'chat:message':
      if (state.messages.some((message) => message.id === action.message.id)) {
        return state;
      }

      return {
        ...state,
        messages: [...state.messages, action.message]
      };
    case 'error':
      return {
        ...state,
        status: action.code === 'ROOM_FULL' ? 'room-full' : 'error',
        error: action.message || 'Не удалось подключиться к серверу'
      };
    case 'reset':
      return initialRoomState;
    default:
      return state;
  }
}

export function useRoom({ roomId, displayName, media = {}, enabled = true }) {
  const [state, dispatch] = useReducer(roomReducer, initialRoomState);
  const [socketClient, setSocketClient] = useState(null);
  const socketRef = useRef(null);
  const joinPayloadRef = useRef({ roomId, displayName, media });

  joinPayloadRef.current = { roomId, displayName, media };

  const connect = useCallback(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: false
    });

    socketRef.current = socket;
    setSocketClient(socket);
    dispatch({ type: 'connecting' });

    socket.on('connect', () => {
      const payload = joinPayloadRef.current;

      socket.emit(
        'room:join',
        {
          roomId: payload.roomId,
          displayName: payload.displayName,
          media: {
            audioEnabled: Boolean(payload.media.audioEnabled),
            videoEnabled: Boolean(payload.media.videoEnabled)
          }
        },
        (response) => {
          if (!response?.ok) {
            dispatch({
              type: 'error',
              code: response?.code,
              message: response?.message
            });
            socket.disconnect();
            return;
          }

          dispatch({
            type: 'joined',
            participantId: response.participantId,
            room: response.room
          });
        }
      );
    });

    socket.on('connect_error', () => {
      dispatch({
        type: 'error',
        code: 'SERVER_UNAVAILABLE',
        message: 'Не удалось подключиться к серверу'
      });
    });

    socket.on('participants:list', ({ participants }) => {
      dispatch({
        type: 'participants:list',
        participants
      });
    });

    socket.on('participant:media-updated', ({ participant }) => {
      dispatch({
        type: 'participant:media-updated',
        participant
      });
    });

    socket.on('chat:message', (message) => {
      dispatch({
        type: 'chat:message',
        message
      });
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        return;
      }

      dispatch({
        type: 'error',
        code: 'SERVER_UNAVAILABLE',
        message: 'Соединение с сервером потеряно'
      });
    });

    return socket;
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const socket = connect();

    return () => {
      socket.emit('room:leave', {});
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
        setSocketClient(null);
      }
    };
  }, [connect, displayName, enabled, roomId]);

  useEffect(() => {
    const socket = socketRef.current;

    if (!enabled || state.status !== 'joined' || !socket?.connected) {
      return;
    }

    socket.emit('media:update', {
      roomId,
      audioEnabled: Boolean(media.audioEnabled),
      videoEnabled: Boolean(media.videoEnabled)
    });
  }, [enabled, media.audioEnabled, media.videoEnabled, roomId, state.status]);

  const retry = useCallback(() => {
    socketRef.current?.disconnect();
    connect();
  }, [connect]);

  const sendChatMessage = useCallback(
    (text) =>
      new Promise((resolve) => {
        const socket = socketRef.current;

        if (!socket?.connected || state.status !== 'joined') {
          resolve({
            ok: false,
            message: 'Нет подключения к комнате'
          });
          return;
        }

        socket.emit(
          'chat:send',
          {
            roomId,
            text
          },
          (response) => {
            resolve(response ?? { ok: false, message: 'Не удалось отправить сообщение' });
          }
        );
      }),
    [roomId, state.status]
  );

  return {
    ...state,
    socket: socketClient,
    retry,
    sendChatMessage
  };
}
