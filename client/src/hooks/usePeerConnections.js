import { useCallback, useEffect, useRef, useState } from 'react';
import { buildIceServers, DEFAULT_STUN_URLS, isPeerConnectionSupported } from '../lib/webrtc.js';

const STUN_URLS = import.meta.env.VITE_STUN_URLS ?? DEFAULT_STUN_URLS;

export function usePeerConnections({ socket, roomId, participantId, participants, localStream }) {
  const peerConnectionsRef = useRef(new Map());
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
        const [remoteStream] = event.streams;

        if (!remoteStream) {
          return;
        }

        setRemoteStreams((currentStreams) => ({
          ...currentStreams,
          [remoteParticipantId]: remoteStream
        }));
      };

      peerConnection.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(peerConnection.connectionState)) {
          setPeerErrors((currentErrors) => ({
            ...currentErrors,
            [remoteParticipantId]: 'Соединение с участником недоступно'
          }));
        }
      };

      syncLocalTracks(peerConnection, localStreamRef.current);
      peerConnectionsRef.current.set(remoteParticipantId, peerConnection);

      return peerConnection;
    },
    [roomId, socket]
  );

  useEffect(() => {
    for (const participant of participants) {
      if (participant.id !== participantId) {
        const peerConnection = peerConnectionsRef.current.get(participant.id);

        if (peerConnection) {
          syncLocalTracks(peerConnection, localStream);
        }
      }
    }
  }, [localStream, participantId, participants]);

  useEffect(() => {
    if (!socket || !participantId) {
      return undefined;
    }

    async function handleParticipantJoined({ participant }) {
      if (!participant || participant.id === participantId) {
        return;
      }

      const peerConnection = getOrCreatePeerConnection(participant.id);

      if (!peerConnection) {
        return;
      }

      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('webrtc:offer', {
          roomId,
          to: participant.id,
          payload: offer
        });
      } catch {
        setPeerErrors((currentErrors) => ({
          ...currentErrors,
          [participant.id]: 'Не удалось создать WebRTC offer'
        }));
      }
    }

    async function handleOffer({ from, payload }) {
      const peerConnection = getOrCreatePeerConnection(from);

      if (!peerConnection) {
        return;
      }

      try {
        await peerConnection.setRemoteDescription(payload);
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
  }, [closePeerConnection, getOrCreatePeerConnection, participantId, roomId, socket]);

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
    return () => {
      for (const peerConnection of peerConnectionsRef.current.values()) {
        peerConnection.close();
      }

      peerConnectionsRef.current.clear();
      setRemoteStreams({});
      setPeerErrors({});
    };
  }, []);

  return {
    remoteStreams,
    peerErrors
  };
}

function syncLocalTracks(peerConnection, localStream) {
  if (!localStream) {
    return;
  }

  const localTracks = localStream.getTracks();

  for (const localTrack of localTracks) {
    const sender = peerConnection
      .getSenders()
      .find((candidateSender) => candidateSender.track?.kind === localTrack.kind);

    if (sender) {
      if (sender.track !== localTrack) {
        sender.replaceTrack(localTrack);
      }
    } else {
      peerConnection.addTrack(localTrack, localStream);
    }
  }

  for (const sender of peerConnection.getSenders()) {
    if (sender.track && !localTracks.includes(sender.track)) {
      sender.replaceTrack(null);
    }
  }
}
