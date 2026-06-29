import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Copy,
  CopyCheck,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  X,
  UserRound,
  Video,
  VideoOff,
  Volume2
} from 'lucide-react';
import { useLocalMedia } from '../hooks/useLocalMedia.js';
import { usePeerConnections } from '../hooks/usePeerConnections.js';
import { useRoom } from '../hooks/useRoom.js';
import { useUiFeedback } from '../hooks/useUiFeedback.js';
import { MAX_DISPLAY_NAME_LENGTH, validateDisplayName } from '../lib/displayName.js';
import { canSendMessage, formatMessageTime, normalizeOutgoingMessage } from '../lib/chat.js';
import { buildRoomPath, generateRoomId, parseRoute } from '../lib/routing.js';
import {
  getInitials,
  getVideoFallbackLabel,
  hasLiveVideoTrack,
  isAudioMuted
} from '../lib/videoTile.js';

const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000';

const buttonMotion = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.96 },
  transition: { type: 'spring', stiffness: 520, damping: 32 }
};

const softSpring = {
  type: 'spring',
  stiffness: 420,
  damping: 34
};

const routeTransition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1]
};

const routeVariants = {
  initial: {
    opacity: 0,
    y: 16,
    scale: 0.985,
    filter: 'blur(6px)'
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)'
  },
  exit: {
    opacity: 0,
    y: -14,
    scale: 0.99,
    filter: 'blur(5px)'
  }
};

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

  async function handleJoinRoom(roomId, nextDisplayName) {
    const availability = await checkDisplayNameAvailability(roomId, nextDisplayName);

    if (!availability.ok) {
      return availability;
    }

    setDisplayName(availability.displayName ?? nextDisplayName);

    return {
      ok: true
    };
  }

  return (
    <AnimatePresence mode="wait">
      {route.name === 'room' && !displayName ? (
        <AnimatedRoute key={`gate-${route.roomId ?? 'room'}`}>
          <NameGate
            title="Войти в комнату"
            submitLabel="Войти"
            pendingLabel="Проверяем..."
            onSubmit={(nextDisplayName) => handleJoinRoom(route.roomId, nextDisplayName)}
          />
        </AnimatedRoute>
      ) : null}
      {route.name === 'room' && displayName ? (
        <AnimatedRoute key={`room-${route.roomId}`}>
          <RoomShell
            roomId={route.roomId}
            displayName={displayName}
            onGoHome={() => {
              setDisplayName('');
              navigate('/');
            }}
          />
        </AnimatedRoute>
      ) : null}
      {route.name !== 'room' ? (
        <AnimatedRoute key="home">
          <NameGate title="Видеочат-комната" submitLabel="Создать комнату" onSubmit={handleCreateRoom} />
        </AnimatedRoute>
      ) : null}
    </AnimatePresence>
  );
}

function AnimatedRoute({ children }) {
  return (
    <motion.div
      className="route-transition"
      variants={routeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={routeTransition}
    >
      {children}
    </motion.div>
  );
}

async function checkDisplayNameAvailability(roomId, displayName) {
  try {
    const response = await fetch(
      `${SERVER_URL}/rooms/${encodeURIComponent(roomId)}/display-name-availability?displayName=${encodeURIComponent(displayName)}`
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        error: payload?.message ?? 'Не удалось проверить никнейм'
      };
    }

    if (!payload.available) {
      return {
        ok: false,
        error: 'Этот никнейм уже занят в комнате'
      };
    }

    return {
      ok: true,
      displayName: payload.displayName
    };
  } catch {
    return {
      ok: false,
      error: 'Не удалось проверить никнейм: сервер недоступен'
    };
  }
}

function NameGate({ title, submitLabel, pendingLabel = submitLabel, onSubmit }) {
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const feedback = useUiFeedback();

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    feedback.playClick();

    const result = validateDisplayName(nameInput);

    if (!result.ok) {
      feedback.playError();
      setError(result.error);
      return;
    }

    setIsSubmitting(true);
    setError('');

    const submitResult = await onSubmit(result.value);

    if (submitResult?.ok === false) {
      feedback.playError();
      setError(submitResult.error ?? 'Не удалось войти');
      setIsSubmitting(false);
      return;
    }

    feedback.playSuccess();
    setNameInput(submitResult?.displayName ?? result.value);
    setIsSubmitting(false);
  }

  return (
    <main className="app-shell">
      <motion.section
        className="start-panel"
        aria-labelledby="app-title"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={softSpring}
      >
        <p className="eyebrow">Video Chat Room</p>
        <h1 id="app-title">{title}</h1>
        <motion.form
          className="start-form"
          onSubmit={handleSubmit}
          noValidate
          animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.24 }}
        >
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
            disabled={isSubmitting}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'display-name-error' : undefined}
            onChange={(event) => {
              setNameInput(event.target.value);
              if (error) {
                setError('');
              }
            }}
          />
          <AnimatePresence>
            {error ? (
              <motion.p
                className="field-error"
                id="display-name-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>
          <motion.button type="submit" disabled={isSubmitting} {...buttonMotion}>
            {isSubmitting ? pendingLabel : submitLabel}
          </motion.button>
        </motion.form>
      </motion.section>
    </main>
  );
}

function RoomShell({ roomId, displayName, onGoHome }) {
  const [inviteStatus, setInviteStatus] = useState({ type: 'idle', message: '' });
  const [isLeaving, setIsLeaving] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const previousParticipantIdsRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const previousRoomStatusRef = useRef('idle');
  const feedback = useUiFeedback();
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

  useEffect(() => {
    if (room.status !== 'joined') {
      previousParticipantIdsRef.current = null;
      return;
    }

    const participantIds = new Set(room.participants.map((participant) => participant.id));
    const previousParticipantIds = previousParticipantIdsRef.current;

    if (previousParticipantIds) {
      if (participantIds.size > previousParticipantIds.size) {
        feedback.playJoin();
      } else if (participantIds.size < previousParticipantIds.size) {
        feedback.playLeave();
      }
    }

    previousParticipantIdsRef.current = participantIds;
  }, [feedback, room.participants, room.status]);

  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    const lastMessage = room.messages.at(-1);

    if (
      room.status === 'joined' &&
      room.messages.length > previousMessageCount &&
      lastMessage?.type === 'user' &&
      lastMessage.senderId !== room.participantId
    ) {
      feedback.playMessage();
    }

    previousMessageCountRef.current = room.messages.length;
  }, [feedback, room.messages, room.participantId, room.status]);

  useEffect(() => {
    if (room.status === 'error' && previousRoomStatusRef.current !== 'error') {
      feedback.playError();
    }

    previousRoomStatusRef.current = room.status;
  }, [feedback, room.status]);

  async function handleCopyInviteLink() {
    feedback.playClick();

    if (!navigator.clipboard?.writeText) {
      feedback.playError();
      setInviteStatus({
        type: 'error',
        message: 'Браузер не разрешил копирование. Скопируйте адрес из строки браузера.'
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      feedback.playSuccess();
      setInviteStatus({ type: 'success', message: 'Ссылка скопирована' });
    } catch {
      feedback.playError();
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

    feedback.playLeave();
    setIsLeaving(true);
    await room.leaveRoom();
    peers.closeAllPeerConnections();
    localMedia.stopLocalMedia();
    onGoHome();
  }

  function handleToggleAudio() {
    feedback.playToggle();
    localMedia.toggleAudio();
  }

  function handleToggleVideo() {
    feedback.playToggle();
    localMedia.toggleVideo();
  }

  function handleOpenChat() {
    feedback.playClick();
    setIsChatOpen(true);
  }

  function handleCloseChat() {
    feedback.playClick();
    setIsChatOpen(false);
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
      <AnimatePresence>
        {mediaWarnings.length > 0 ? (
          <motion.div
            className="media-warning"
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={softSpring}
          >
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              {mediaWarnings.map((warning) => (
                <span key={warning.kind} className="media-warning-item">
                  {warning.message}
                </span>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <section className="room-main" aria-label="Комната видеочата">
        <div className="video-stage">
          <div className="stage-body">
            <AnimatePresence mode="popLayout">
              {localMedia.status === 'requesting' ? (
                <motion.p
                  key="requesting"
                  className="room-status"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  Запрашиваем доступ к камере и микрофону...
                </motion.p>
              ) : null}
              {canJoinRoom && room.status === 'connecting' ? (
                <motion.p
                  key="connecting"
                  className="room-status"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  Подключение...
                </motion.p>
              ) : null}
              {room.status === 'error' ? (
                <RoomError key="error" message={room.error} onRetry={room.retry} illustration />
              ) : null}
              {room.status === 'room-full' ? (
                <RoomError
                  key="room-full"
                  message="Комната заполнена"
                  actionLabel="Повторить вход"
                  onRetry={room.retry}
                />
              ) : null}
              {room.status === 'display-name-taken' ? (
                <RoomError
                  key="display-name-taken"
                  message={room.error}
                  actionLabel="Повторить вход"
                  onRetry={room.retry}
                />
              ) : null}
              {room.status === 'joined' ? (
                <motion.div
                  key="video-grid"
                  className="stage-grid-shell"
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={softSpring}
                >
                  <VideoGrid
                    localParticipant={localParticipant}
                    localDisplayName={displayName}
                    localStream={localMedia.stream}
                    participants={room.participants}
                    participantId={room.participantId}
                    remoteStreams={peers.remoteStreams}
                    peerErrors={peers.peerErrors}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="media-controls" aria-label="Управление звонком">
            <motion.button
              type="button"
              className="icon-button mobile-chat-toggle"
              aria-label="Открыть чат"
              title="Открыть чат"
              onClick={handleOpenChat}
              {...buttonMotion}
            >
              <MessageCircle size={20} />
            </motion.button>
            <motion.button
              type="button"
              className="icon-button"
              aria-label={audioControlDisabled ? 'Микрофон недоступен' : localMedia.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
              title={audioControlDisabled ? localMedia.audioError : localMedia.audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
              disabled={audioControlDisabled}
              onClick={handleToggleAudio}
              {...buttonMotion}
            >
              {localMedia.audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </motion.button>
            <motion.button
              type="button"
              className="icon-button"
              aria-label={videoControlDisabled ? 'Камера недоступна' : localMedia.videoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              title={videoControlDisabled ? localMedia.videoError : localMedia.videoEnabled ? 'Выключить камеру' : 'Включить камеру'}
              disabled={videoControlDisabled}
              onClick={handleToggleVideo}
              {...buttonMotion}
            >
              {localMedia.videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </motion.button>
            <motion.button
              type="button"
              className="icon-button danger"
              aria-label={isLeaving ? 'Выход из комнаты' : 'Выйти'}
              title={isLeaving ? 'Выход из комнаты' : 'Выйти'}
              disabled={isLeaving}
              onClick={handleLeaveRoom}
              {...buttonMotion}
            >
              <LogOut size={20} />
            </motion.button>
          </div>
        </div>
        <button
          type="button"
          className={`sidebar-backdrop ${isChatOpen ? 'is-open' : ''}`}
          aria-label="Закрыть чат"
          onClick={handleCloseChat}
        />
        <aside className={`room-sidebar ${isChatOpen ? 'is-open' : ''}`}>
          <motion.button
            type="button"
            className="sidebar-close"
            aria-label="Закрыть чат"
            title="Закрыть чат"
            onClick={handleCloseChat}
            {...buttonMotion}
          >
            <X size={20} />
          </motion.button>
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
        <motion.ul className="participants-list" layout>
          <AnimatePresence initial={false}>
            {participants.map((participant, index) => {
              const isSelf = participant.id === localParticipantId;
              const audioEnabled = Boolean(participant.media?.audioEnabled);
              const videoEnabled = Boolean(participant.media?.videoEnabled);

              return (
                <motion.li
                  key={participant.id}
                  className={isSelf ? 'is-self' : undefined}
                  layout
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={softSpring}
                >
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
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
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
  const feedback = useUiFeedback();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSendMessage(messageText)) {
      return;
    }

    feedback.playClick();
    const outgoingMessage = normalizeOutgoingMessage(messageText);
    const response = await onSendMessage(outgoingMessage);

    if (!response?.ok) {
      feedback.playError();
      setError(response?.message ?? 'Не удалось отправить сообщение');
      return;
    }

    feedback.playSuccess();
    setError('');
    setMessageText('');
  }

  return (
    <section className="messages-panel" aria-labelledby="messages-title">
      <h2 id="messages-title">Сообщения</h2>
      <div className="messages-list" role="log" aria-live="polite">
        {messages.length > 0 ? (
          <motion.ul layout>
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.li
                  key={message.id}
                  className={message.type === 'system' ? 'system-message' : ''}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={softSpring}
                >
                  <span className="message-time">{formatMessageTime(message.createdAt)}</span>
                  {message.type === 'user' ? <strong>{message.senderName}: </strong> : null}
                  <span>{message.text}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
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
        <motion.button type="submit" disabled={!canSendMessage(messageText)} {...buttonMotion}>
          Отправить
        </motion.button>
      </form>
      <AnimatePresence>
        {error ? (
          <motion.p
            className="field-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
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
  const [focusedTileId, setFocusedTileId] = useState('');
  const feedback = useUiFeedback();
  const remoteParticipants = participants.filter((participant) => participant.id !== participantId);
  const tiles = [
    {
      id: 'local',
      displayName: localParticipant?.displayName ?? localDisplayName,
      stream: localStream,
      media: localParticipant?.media,
      isMuted: true,
      isSelf: true
    },
    ...remoteParticipants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      stream: remoteStreams[participant.id],
      media: participant.media,
      error: peerErrors[participant.id]
    }))
  ];
  const visibleTiles = focusedTileId
    ? tiles.filter((tile) => tile.id === focusedTileId)
    : tiles;

  function handleTileToggle(tileId) {
    feedback.playClick();
    setFocusedTileId((currentTileId) => (currentTileId === tileId ? '' : tileId));
  }

  return (
    <div
      className="video-grid"
      data-count={Math.max(1, visibleTiles.length)}
      data-focused={focusedTileId ? 'true' : 'false'}
    >
      <AnimatePresence initial={false}>
        {visibleTiles.map((tile) => (
          <VideoTile
            key={tile.id}
            displayName={tile.displayName}
            stream={tile.stream}
            media={tile.media}
            error={tile.error}
            isMuted={tile.isMuted}
            isSelf={tile.isSelf}
            isFocused={focusedTileId === tile.id}
            onToggleFocus={() => handleTileToggle(tile.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function VideoTile({
  displayName,
  stream,
  media,
  error = '',
  isMuted = false,
  isSelf = false,
  isFocused = false,
  onToggleFocus
}) {
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

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggleFocus?.();
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
    <motion.article
      className={`video-tile ${isFocused ? 'is-focused' : ''}`}
      layout
      role="button"
      tabIndex={0}
      aria-pressed={isFocused}
      onClick={onToggleFocus}
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={softSpring}
    >
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
        <button
          type="button"
          className="sound-button"
          onClick={(event) => {
            event.stopPropagation();
            handleEnableSound();
          }}
        >
          <Volume2 size={18} />
          <span>Включить звук</span>
        </button>
      ) : null}
      {error ? <p className="tile-error">{error}</p> : null}
    </motion.article>
  );
}

function RoomError({ message, actionLabel = 'Повторить', onRetry, illustration = false }) {
  const feedback = useUiFeedback();

  function handleRetry() {
    feedback.playClick();
    onRetry();
  }

  return (
    <motion.div
      className="room-error"
      role="alert"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8 }}
      transition={softSpring}
    >
      {illustration ? <ServerUnavailableIllustration /> : null}
      <p>{message}</p>
      <motion.button type="button" onClick={handleRetry} {...buttonMotion}>
        {actionLabel}
      </motion.button>
    </motion.div>
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
