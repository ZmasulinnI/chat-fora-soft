import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  CopyCheck,
  LogOut,
  Mic,
  MicOff,
  UserRound,
  Video,
  VideoOff,
  Volume2
} from 'lucide-react';
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
  const [inviteStatus, setInviteStatus] = useState({ type: 'idle', message: '' });
  const [isLeaving, setIsLeaving] = useState(false);
  const localMedia = useLocalMedia();
  const mediaWarnings = getLocalMediaWarnings(localMedia);
  const audioControlDisabled = Boolean(localMedia.audioError) || localMedia.status === 'unsupported';
  const videoControlDisabled = Boolean(localMedia.videoError) || localMedia.status === 'unsupported';
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

  useEffect(() => {
    if (inviteStatus.type === 'idle') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setInviteStatus({ type: 'idle', message: '' });
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [inviteStatus.type]);

  async function handleCopyInviteLink() {
    if (!navigator.clipboard?.writeText) {
      setInviteStatus({
        type: 'error',
        message: 'Браузер не разрешил копирование. Скопируйте адрес из строки браузера.'
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setInviteStatus({ type: 'success', message: 'Ссылка скопирована' });
    } catch {
      setInviteStatus({
        type: 'error',
        message: 'Не удалось скопировать ссылку. Скопируйте адрес из строки браузера.'
      });
    }
  }

  async function handleLeaveRoom() {
    if (isLeaving) {
      return;
    }

    setIsLeaving(true);
    await room.leaveRoom();
    peers.closeAllPeerConnections();
    localMedia.stopLocalMedia();
    onGoHome();
  }

  return (
    <main className="room-shell">
      <header className="room-topbar">
        <div>
          <p className="eyebrow">Комната</p>
          <h1>{roomId}</h1>
        </div>
        <div className="room-topbar-actions">
          <div className="room-meta" aria-label="Состояние комнаты">
            <span>{room.status === 'joined' ? 'Подключено' : 'Подключение'}</span>
            <span>{room.participants.length}/4 участника</span>
            <span>{displayName}</span>
          </div>
          <button
            type="button"
            className="invite-button"
            onClick={handleCopyInviteLink}
            aria-label="Скопировать ссылку приглашения"
            title="Скопировать ссылку приглашения"
          >
            {inviteStatus.type === 'success' ? <CopyCheck size={18} /> : <Copy size={18} />}
            <span>Ссылка</span>
          </button>
          <p className={`invite-status ${inviteStatus.type}`} aria-live="polite">
            {inviteStatus.message}
          </p>
        </div>
      </header>
      {mediaWarnings.length > 0 ? (
        <div className="media-warning" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            {mediaWarnings.map((warning) => (
              <span key={warning.kind} className="media-warning-item">
                {warning.message}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <section className="room-main" aria-label="Комната видеочата">
        <div className="video-stage">
          <div className="stage-body">
            {localMedia.status === 'requesting' ? <p>Запрашиваем доступ к камере и микрофону...</p> : null}
            {canJoinRoom && room.status === 'connecting' ? <p>Подключение...</p> : null}
            {room.status === 'error' ? <RoomError message={room.error} onRetry={room.retry} illustration /> : null}
            {room.status === 'room-full' ? (
              <RoomError message="Комната заполнена" actionLabel="Повторить вход" onRetry={room.retry} />
            ) : null}
            {room.status === 'display-name-taken' ? (
              <RoomError message={room.error} actionLabel="Повторить вход" onRetry={room.retry} />
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
              aria-label={audioControlDisabled ? 'Микрофон недоступен' : localMedia.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
              title={audioControlDisabled ? localMedia.audioError : localMedia.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
              disabled={audioControlDisabled}
              onClick={localMedia.toggleAudio}
            >
              {localMedia.audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={videoControlDisabled ? 'Камера недоступна' : localMedia.videoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              title={videoControlDisabled ? localMedia.videoError : localMedia.videoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              disabled={videoControlDisabled}
              onClick={localMedia.toggleVideo}
            >
              {localMedia.videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              type="button"
              className="icon-button danger"
              aria-label={isLeaving ? 'Выход из комнаты' : 'Выйти'}
              title={isLeaving ? 'Выход из комнаты' : 'Выйти'}
              disabled={isLeaving}
              onClick={handleLeaveRoom}
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
        <aside className="room-sidebar">
          <ParticipantList participants={room.participants} localParticipantId={room.participantId} />
          <ChatPanel messages={room.messages} onSendMessage={room.sendChatMessage} />
        </aside>
      </section>
    </main>
  );
}

function getLocalMediaWarnings(localMedia) {
  const warnings = [];

  if (localMedia.audioError) {
    warnings.push({
      kind: 'audio',
      message: localMedia.audioError
    });
  }

  if (localMedia.videoError) {
    warnings.push({
      kind: 'video',
      message: localMedia.videoError
    });
  }

  if (warnings.length === 0 && localMedia.error) {
    warnings.push({
      kind: 'general',
      message: localMedia.error
    });
  }

  return warnings;
}

function ParticipantList({ participants, localParticipantId }) {
  return (
    <section className="participants-panel" aria-labelledby="participants-title">
      <div className="panel-title-row">
        <h2 id="participants-title">Участники</h2>
        <span>{participants.length}/4</span>
      </div>
      {participants.length > 0 ? (
        <ul className="participants-list">
          {participants.map((participant, index) => {
            const isSelf = participant.id === localParticipantId;
            const audioEnabled = Boolean(participant.media?.audioEnabled);
            const videoEnabled = Boolean(participant.media?.videoEnabled);

            return (
              <li key={participant.id} className={isSelf ? 'is-self' : undefined}>
                <span className="participant-avatar" aria-hidden="true">
                  {getInitials(participant.displayName)}
                </span>
                <span className="participant-main">
                  <span className="participant-name">
                    {participant.displayName}
                    {isSelf ? <span className="self-label">вы</span> : null}
                  </span>
                  <span className="participant-ordinal">
                    <UserRound size={13} aria-hidden="true" />
                    #{index + 1}
                  </span>
                </span>
                <span className="participant-status" aria-label="Состояние медиа">
                  {audioEnabled ? (
                    <Mic size={14} aria-label="Микрофон включен" />
                  ) : (
                    <MicOff size={14} aria-label="Микрофон выключен" />
                  )}
                  {videoEnabled ? (
                    <Video size={14} aria-label="Камера включена" />
                  ) : (
                    <VideoOff size={14} aria-label="Камера выключена" />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Пока никого нет</p>
      )}
    </section>
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
  const mediaRef = useRef(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const hasLiveVideo = hasLiveVideoTrack(stream, media);
  const audioMuted = isAudioMuted(media);
  const shouldRenderMediaElement = Boolean(stream && (hasLiveVideo || (!isSelf && !audioMuted)));
  const fallbackLabel = getVideoFallbackLabel(media);

  useEffect(() => {
    const mediaElement = mediaRef.current;

    setAutoplayBlocked(false);

    if (!mediaElement) {
      return undefined;
    }

    if (mediaElement.srcObject !== stream) {
      mediaElement.srcObject = stream ?? null;
    }

    if (!stream) {
      return undefined;
    }

    const playPromise = mediaElement.play();

    if (playPromise) {
      playPromise.catch(() => {
        if (!isSelf && !audioMuted) {
          setAutoplayBlocked(true);
        }
      });
    }

    return undefined;
  }, [audioMuted, hasLiveVideo, isSelf, stream, shouldRenderMediaElement]);

  async function handleEnableSound() {
    try {
      await mediaRef.current?.play();
      setAutoplayBlocked(false);
    } catch {
      setAutoplayBlocked(true);
    }
  }

  function renderMediaElement() {
    if (!shouldRenderMediaElement) {
      return null;
    }

    if (hasLiveVideo) {
      return <video ref={mediaRef} autoPlay playsInline muted={isMuted} />;
    }

    return <audio ref={mediaRef} autoPlay />;
  }

  function renderFallback() {
    if (hasLiveVideo) {
      return null;
    }

    return (
      <div className="video-fallback" aria-label={`${displayName}: ${fallbackLabel}`}>
        <span>{getInitials(displayName)}</span>
        <p>{fallbackLabel}</p>
      </div>
    );
  }

  useEffect(() => {
    if (!autoplayBlocked || !audioMuted) {
      return undefined;
    }

    setAutoplayBlocked(false);
    return undefined;
  }, [audioMuted, autoplayBlocked]);

  return (
    <article className="video-tile">
      {renderMediaElement()}
      {renderFallback()}
      <div className="tile-overlay">
        <span>{isSelf ? `${displayName} (вы)` : displayName}</span>
        <span className="tile-status-icons" aria-label="Состояние медиа">
          {audioMuted ? <MicOff size={16} aria-label="Микрофон выключен" /> : null}
          {!hasLiveVideo ? <VideoOff size={16} aria-label="Камера выключена" /> : null}
        </span>
      </div>
      {autoplayBlocked ? (
        <button type="button" className="sound-button" onClick={handleEnableSound}>
          <Volume2 size={18} />
          <span>Включить звук</span>
        </button>
      ) : null}
      {error ? <p className="tile-error">{error}</p> : null}
    </article>
  );
}

function RoomError({ message, actionLabel = 'Повторить', onRetry, illustration = false }) {
  return (
    <div className="room-error" role="alert">
      {illustration ? <ServerUnavailableIllustration /> : null}
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        {actionLabel}
      </button>
    </div>
  );
}

function ServerUnavailableIllustration() {
  return (
    <svg
      className="server-unavailable-illustration"
      width="132"
      height="112"
      viewBox="0 0 132 112"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M32 78h68a14 14 0 0 0 2.6-27.8A25.2 25.2 0 0 0 53.7 42 19 19 0 0 0 32 78Z"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <rect x="36" y="72" width="60" height="23" rx="7" stroke="currentColor" strokeWidth="5" />
      <path d="M50 84h18M78 84h4" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M47 22 85 98" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="96" cy="84" r="3.5" fill="currentColor" />
    </svg>
  );
}
