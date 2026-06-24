import { useEffect, useRef, useState } from 'react';
import { LogOut, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useLocalMedia } from '../hooks/useLocalMedia.js';
import { usePeerConnections } from '../hooks/usePeerConnections.js';
import { useRoom } from '../hooks/useRoom.js';
import { MAX_DISPLAY_NAME_LENGTH, validateDisplayName } from '../lib/displayName.js';
import { canSendMessage, formatMessageTime, normalizeOutgoingMessage } from '../lib/chat.js';
import { buildRoomPath, generateRoomId, parseRoute } from '../lib/routing.js';
import {
  getInitials,
  getVideoFallbackLabel,
  hasLiveVideoTrack,
  isAudioMuted
} from '../lib/videoTile.js';

export function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    function handlePopState() {
      setRoute(parseRoute(window.location.pathname));
    }

    window.addEventListener('popstate', handlePopState);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (route.name !== 'room' && displayName) {
      setDisplayName('');
    }
  }, [displayName, route.name]);

  function navigate(path) {
    window.history.pushState(null, '', path);
    setRoute(parseRoute(window.location.pathname));
  }

  function handleCreateRoom(nextDisplayName) {
    setDisplayName(nextDisplayName);
    navigate(buildRoomPath(generateRoomId()));
  }

  if (route.name === 'room') {
    if (!displayName) {
      return (
        <NameGate
          title="Войти в комнату"
          submitLabel="Войти"
          onSubmit={(nextDisplayName) => setDisplayName(nextDisplayName)}
        />
      );
    }

    return (
      <RoomShell
        roomId={route.roomId}
        displayName={displayName}
        onGoHome={() => {
          setDisplayName('');
          navigate('/');
        }}
      />
    );
  }

  return (
    <NameGate title="Видеочат-комната" submitLabel="Создать комнату" onSubmit={handleCreateRoom} />
  );
}

function NameGate({ title, submitLabel, onSubmit }) {
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();

    const result = validateDisplayName(nameInput);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError('');
    setNameInput(result.value);
    onSubmit(result.value);
  }

  return (
    <main className="app-shell">
      <section className="start-panel" aria-labelledby="app-title">
        <p className="eyebrow">Video Chat Room</p>
        <h1 id="app-title">{title}</h1>
        <form className="start-form" onSubmit={handleSubmit} noValidate>
          <label className="field-label" htmlFor="display-name">
            Имя
          </label>
          <input
            id="display-name"
            name="displayName"
            autoComplete="name"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder="Алекс"
            value={nameInput}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'display-name-error' : undefined}
            onChange={(event) => {
              setNameInput(event.target.value);
              if (error) {
                setError('');
              }
            }}
          />
          {error ? (
            <p className="field-error" id="display-name-error">
              {error}
            </p>
          ) : null}
          <button type="submit">{submitLabel}</button>
        </form>
      </section>
    </main>
  );
}

function RoomShell({ roomId, displayName, onGoHome }) {
  const localMedia = useLocalMedia();
  const canJoinRoom = localMedia.status === 'ready' || localMedia.status === 'unsupported';
  const room = useRoom({ roomId, displayName, media: localMedia, enabled: canJoinRoom });
  const peers = usePeerConnections({
    socket: room.socket,
    roomId,
    participantId: room.participantId,
    participants: room.participants,
    localStream: localMedia.stream
  });
  const localParticipant = room.participants.find((participant) => participant.id === room.participantId);

  return (
    <main className="room-shell">
      <header className="room-topbar">
        <div>
          <p className="eyebrow">Комната</p>
          <h1>{roomId}</h1>
        </div>
        <div className="room-meta" aria-label="Состояние комнаты">
          <span>{room.status === 'joined' ? 'Подключено' : 'Подключение'}</span>
          <span>{room.participants.length}/4 участника</span>
          <span>{displayName}</span>
        </div>
      </header>
      <section className="room-main" aria-label="Комната видеочата">
        <div className="video-stage">
          <div className="stage-body">
            {localMedia.status === 'requesting' ? <p>Запрашиваем доступ к камере и микрофону...</p> : null}
            {localMedia.error ? <p className="media-warning">{localMedia.error}</p> : null}
            {canJoinRoom && room.status === 'connecting' ? <p>Подключение...</p> : null}
            {room.status === 'error' ? <RoomError message={room.error} onRetry={room.retry} /> : null}
            {room.status === 'room-full' ? (
              <RoomError message="Комната заполнена" actionLabel="Повторить вход" onRetry={room.retry} />
            ) : null}
            {room.status === 'joined' ? (
              <VideoGrid
                localParticipant={localParticipant}
                localDisplayName={displayName}
                localStream={localMedia.stream}
                participants={room.participants}
                participantId={room.participantId}
                remoteStreams={peers.remoteStreams}
                peerErrors={peers.peerErrors}
              />
            ) : null}
          </div>
          <div className="media-controls" aria-label="Управление звонком">
            <button
              type="button"
              className="icon-button"
              aria-label={localMedia.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
              title={localMedia.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
              onClick={localMedia.toggleAudio}
            >
              {localMedia.audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={localMedia.videoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              title={localMedia.videoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              onClick={localMedia.toggleVideo}
            >
              {localMedia.videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              type="button"
              className="icon-button danger"
              aria-label="Выйти"
              title="Выйти"
              onClick={onGoHome}
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
        <aside className="room-sidebar">
          <section className="participants-panel" aria-labelledby="participants-title">
            <h2 id="participants-title">Участники</h2>
            {room.participants.length > 0 ? (
              <ul>
                {room.participants.map((participant) => (
                  <li key={participant.id}>
                    <span>{participant.displayName}</span>
                    <span className="participant-media">
                      {participant.media?.audioEnabled ? 'микрофон вкл.' : 'микрофон выкл.'}
                      {' · '}
                      {participant.media?.videoEnabled ? 'камера вкл.' : 'камера выкл.'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Пока никого нет</p>
            )}
          </section>
          <ChatPanel messages={room.messages} onSendMessage={room.sendChatMessage} />
        </aside>
      </section>
    </main>
  );
}

function ChatPanel({ messages, onSendMessage }) {
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSendMessage(messageText)) {
      return;
    }

    const outgoingMessage = normalizeOutgoingMessage(messageText);
    const response = await onSendMessage(outgoingMessage);

    if (!response?.ok) {
      setError(response?.message ?? 'Не удалось отправить сообщение');
      return;
    }

    setError('');
    setMessageText('');
  }

  return (
    <section className="messages-panel" aria-labelledby="messages-title">
      <h2 id="messages-title">Сообщения</h2>
      <div className="messages-list" role="log" aria-live="polite">
        {messages.length > 0 ? (
          <ul>
            {messages.map((message) => (
              <li key={message.id} className={message.type === 'system' ? 'system-message' : ''}>
                <span className="message-time">{formatMessageTime(message.createdAt)}</span>
                {message.type === 'user' ? <strong>{message.senderName}: </strong> : null}
                <span>{message.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>История пуста</p>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-message">
          Сообщение
        </label>
        <input
          id="chat-message"
          value={messageText}
          placeholder="Сообщение"
          autoComplete="off"
          onChange={(event) => {
            setMessageText(event.target.value);
            if (error) {
              setError('');
            }
          }}
        />
        <button type="submit" disabled={!canSendMessage(messageText)}>
          Отправить
        </button>
      </form>
      {error ? <p className="field-error">{error}</p> : null}
    </section>
  );
}

function VideoGrid({
  localParticipant,
  localDisplayName,
  localStream,
  participants,
  participantId,
  remoteStreams,
  peerErrors
}) {
  const remoteParticipants = participants.filter((participant) => participant.id !== participantId);

  return (
    <div className="video-grid" data-count={Math.max(1, remoteParticipants.length + 1)}>
      <VideoTile
        displayName={localParticipant?.displayName ?? localDisplayName}
        stream={localStream}
        isMuted
        isSelf
        media={localParticipant?.media}
      />
      {remoteParticipants.map((participant) => (
        <VideoTile
          key={participant.id}
          displayName={participant.displayName}
          stream={remoteStreams[participant.id]}
          media={participant.media}
          error={peerErrors[participant.id]}
        />
      ))}
    </div>
  );
}

function VideoTile({ displayName, stream, media, error = '', isMuted = false, isSelf = false }) {
  const videoRef = useRef(null);
  const hasLiveVideo = hasLiveVideoTrack(stream, media);
  const audioMuted = isAudioMuted(media);
  const fallbackLabel = getVideoFallbackLabel(media);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream ?? null;
    }
  }, [stream]);

  return (
    <article className="video-tile">
      {hasLiveVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={isMuted} />
      ) : (
        <div className="video-fallback" aria-label={`${displayName}: ${fallbackLabel}`}>
          <span>{getInitials(displayName)}</span>
          <p>{fallbackLabel}</p>
        </div>
      )}
      <div className="tile-overlay">
        <span>{isSelf ? `${displayName} (вы)` : displayName}</span>
        <span className="tile-status-icons" aria-label="Состояние медиа">
          {audioMuted ? <MicOff size={16} aria-label="Микрофон выключен" /> : null}
          {!hasLiveVideo ? <VideoOff size={16} aria-label="Камера выключена" /> : null}
        </span>
      </div>
      {error ? <p className="tile-error">{error}</p> : null}
    </article>
  );
}

function RoomError({ message, actionLabel = 'Повторить', onRetry }) {
  return (
    <div className="room-error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        {actionLabel}
      </button>
    </div>
  );
}
