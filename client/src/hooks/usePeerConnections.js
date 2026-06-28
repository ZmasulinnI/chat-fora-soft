import { useCallback, useEffect, useRef, useState } from 'react';
import { buildIceServers, DEFAULT_STUN_URLS, isPeerConnectionSupported } from '../lib/webrtc.js';

const STUN_URLS = import.meta.env.VITE_STUN_URLS ?? DEFAULT_STUN_URLS;

export function usePeerConnections({ socket, roomId, participantId, participants, localStream }) {
  const peerConnectionsRef = useRef(new Map());
  const pendingOffersRef = useRef(new Set());
  const localStreamRef = useRef(localStream);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peerErrors, setPeerErrors] = useState({});

  localStreamRef.current = localStream;

  const closePeerConnection = useCallback((remoteParticipantId) => {
    const peerConnection = peerConnectionsRef.current.get(remoteParticipantId);

    if (peerConnection) {
      peerConnection.close();
      peerConnectionsRef.current.delete(remoteParticipantId);
    }

    setRemoteStreams((currentStreams) => {
      const nextStreams = { ...currentStreams };
      delete nextStreams[remoteParticipantId];
      return nextStreams;
    });
    setPeerErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[remoteParticipantId];
      return nextErrors;
    });
  }, []);

  const closeAllPeerConnections = useCallback(() => {
    for (const peerConnection of peerConnectionsRef.current.values()) {
      peerConnection.close();
    }

    peerConnectionsRef.current.clear();
    setRemoteStreams({});
    setPeerErrors({});
  }, []);

  const getOrCreatePeerConnection = useCallback(
    (remoteParticipantId) => {
      const existingPeerConnection = peerConnectionsRef.current.get(remoteParticipantId);

      if (existingPeerConnection) {
        return existingPeerConnection;
      }

      if (!isPeerConnectionSupported()) {
        setPeerErrors((currentErrors) => ({
          ...currentErrors,
          [remoteParticipantId]: 'Браузер не поддерживает WebRTC'
        }));
        return null;
      }

      const peerConnection = new RTCPeerConnection({
        iceServers: buildIceServers(STUN_URLS)
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit('webrtc:ice-candidate', {
            roomId,
            to: remoteParticipantId,
            payload: event.candidate.toJSON()
          });
        }
      };

      peerConnection.ontrack = (event) => {
        setRemoteStreams((currentStreams) => {
          const remoteStream = getRemoteStreamFromTrackEvent(
            currentStreams[remoteParticipantId],
            event
          );

          if (!remoteStream) {
            return currentStreams;
          }

          return {
            ...currentStreams,
            [remoteParticipantId]: remoteStream
          };
        });
      };

      peerConnection.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(peerConnection.connectionState)) {
          setPeerErrors((currentErrors) => ({
            ...currentErrors,
            [remoteParticipantId]: 'Соединение с участником недоступно'
          }));
        }
      };

      peerConnectionsRef.current.set(remoteParticipantId, peerConnection);

      return peerConnection;
    },
    [roomId, socket]
  );

  const createOfferForParticipant = useCallback(
    async (remoteParticipantId) => {
      if (!socket || !participantId || !shouldInitiateConnection(participantId, remoteParticipantId)) {
        return;
      }

      const peerConnection = getOrCreatePeerConnection(remoteParticipantId);

      if (!peerConnection || pendingOffersRef.current.has(remoteParticipantId)) {
        return;
      }

      if (peerConnection.signalingState !== 'stable' || peerConnection.localDescription) {
        return;
      }

      pendingOffersRef.current.add(remoteParticipantId);

      try {
        await syncLocalTracks(peerConnection, localStreamRef.current);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('webrtc:offer', {
          roomId,
          to: remoteParticipantId,
          payload: offer
        });
      } catch {
        setPeerErrors((currentErrors) => ({
          ...currentErrors,
          [remoteParticipantId]: 'Не удалось создать WebRTC offer'
        }));
      } finally {
        pendingOffersRef.current.delete(remoteParticipantId);
      }
    },
    [getOrCreatePeerConnection, participantId, roomId, socket]
  );

  useEffect(() => {
    for (const participant of participants) {
      if (!participantId || participant.id === participantId) {
        continue;
      }

      const peerConnection = getOrCreatePeerConnection(participant.id);

      if (!peerConnection) {
        continue;
      }

      if (isPeerConnectionNegotiated(peerConnection)) {
        syncLocalTracks(peerConnection, localStream).catch(() => {
          setPeerErrors((currentErrors) => ({
            ...currentErrors,
            [participant.id]: 'Не удалось обновить локальные медиатреки'
          }));
        });
      }

      createOfferForParticipant(participant.id);
    }
  }, [createOfferForParticipant, getOrCreatePeerConnection, localStream, participantId, participants]);

  useEffect(() => {
    if (!socket || !participantId) {
      return undefined;
    }

    async function handleParticipantJoined({ participant }) {
      if (!participant || participant.id === participantId) {
        return;
      }

      await createOfferForParticipant(participant.id);
    }

    async function handleOffer({ from, payload }) {
      const peerConnection = getOrCreatePeerConnection(from);

      if (!peerConnection) {
        return;
      }

      try {
        await peerConnection.setRemoteDescription(payload);
        await syncLocalTracks(peerConnection, localStreamRef.current);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('webrtc:answer', {
          roomId,
          to: from,
          payload: answer
        });
      } catch {
        setPeerErrors((currentErrors) => ({
          ...currentErrors,
          [from]: 'Не удалось обработать WebRTC offer'
        }));
      }
    }

    async function handleAnswer({ from, payload }) {
      const peerConnection = peerConnectionsRef.current.get(from);

      if (!peerConnection) {
        return;
      }

      try {
        await peerConnection.setRemoteDescription(payload);
      } catch {
        setPeerErrors((currentErrors) => ({
          ...currentErrors,
          [from]: 'Не удалось обработать WebRTC answer'
        }));
      }
    }

    async function handleIceCandidate({ from, payload }) {
      const peerConnection = peerConnectionsRef.current.get(from);

      if (!peerConnection || !payload) {
        return;
      }

      try {
        await peerConnection.addIceCandidate(payload);
      } catch {
        setPeerErrors((currentErrors) => ({
          ...currentErrors,
          [from]: 'Не удалось добавить ICE candidate'
        }));
      }
    }

    function handleParticipantLeft({ participantId: leftParticipantId }) {
      closePeerConnection(leftParticipantId);
    }

    socket.on('participant:joined', handleParticipantJoined);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);
    socket.on('participant:left', handleParticipantLeft);

    return () => {
      socket.off('participant:joined', handleParticipantJoined);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      socket.off('participant:left', handleParticipantLeft);
    };
  }, [closePeerConnection, createOfferForParticipant, getOrCreatePeerConnection, participantId, roomId, socket]);

  useEffect(() => {
    const activeRemoteIds = new Set(
      participants
        .filter((participant) => participant.id !== participantId)
        .map((participant) => participant.id)
    );

    for (const remoteParticipantId of peerConnectionsRef.current.keys()) {
      if (!activeRemoteIds.has(remoteParticipantId)) {
        closePeerConnection(remoteParticipantId);
      }
    }
  }, [closePeerConnection, participantId, participants]);

  useEffect(() => {
    return closeAllPeerConnections;
  }, [closeAllPeerConnections]);

  return {
    remoteStreams,
    peerErrors,
    closeAllPeerConnections
  };
}

export async function syncLocalTracks(peerConnection, localStream) {
  if (!localStream) {
    return;
  }

  const localTracks = localStream.getTracks().filter((track) => track.readyState === 'live');
  const audioTrack = localTracks.find((track) => track.kind === 'audio') ?? null;
  const videoTrack = localTracks.find((track) => track.kind === 'video') ?? null;
  const videoSender = ensureVideoSender(peerConnection, videoTrack, localStream);

  if (audioTrack) {
    const audioSender = peerConnection
      .getSenders()
      .find((sender) => sender.track?.kind === 'audio');

    if (audioSender) {
      if (audioSender.track !== audioTrack) {
        await audioSender.replaceTrack(audioTrack);
      }
    } else {
      peerConnection.addTrack(audioTrack, localStream);
    }
  }

  if (videoSender?.setStreams && localStream) {
    videoSender.setStreams(localStream);
  }

  if (videoSender && videoSender.track !== videoTrack) {
    await videoSender.replaceTrack(videoTrack);
  }
}

export function getRemoteStreamFromTrackEvent(existingStream, event) {
  const [eventStream] = event.streams ?? [];

  if (eventStream) {
    return eventStream;
  }

  if (!event.track) {
    return existingStream ?? null;
  }

  const remoteStream = existingStream ?? new MediaStream();
  const hasTrack = remoteStream
    .getTracks()
    .some((track) => track.id === event.track.id);

  if (!hasTrack) {
    remoteStream.addTrack(event.track);
  }

  return remoteStream;
}

export function shouldInitiateConnection(localParticipantId, remoteParticipantId) {
  return String(localParticipantId) < String(remoteParticipantId);
}

function isPeerConnectionNegotiated(peerConnection) {
  return Boolean(peerConnection.localDescription || peerConnection.remoteDescription);
}

function ensureVideoSender(peerConnection, preferredVideoTrack, localStream) {
  const existingVideoTransceiver = peerConnection
    .getTransceivers?.()
    .find(
      (transceiver) =>
        transceiver.sender?.track?.kind === 'video' || transceiver.receiver?.track?.kind === 'video'
    );

  if (existingVideoTransceiver) {
    if (existingVideoTransceiver.direction !== 'stopped') {
      existingVideoTransceiver.direction = 'sendrecv';
    }

    return existingVideoTransceiver.sender;
  }

  const existingVideoSender = peerConnection
    .getSenders()
    .find((sender) => sender.track?.kind === 'video');

  if (existingVideoSender) {
    return existingVideoSender;
  }

  if (typeof peerConnection.addTransceiver === 'function') {
    return peerConnection.addTransceiver('video', {
      direction: 'sendrecv',
      streams: localStream ? [localStream] : []
    }).sender;
  }

  return preferredVideoTrack ? peerConnection.addTrack(preferredVideoTrack, localStream) : null;
}
