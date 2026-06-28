import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRemoteStreamFromTrackEvent,
  shouldInitiateConnection,
  syncLocalTracks
} from './usePeerConnections.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncLocalTracks', () => {
  it('creates a stable sendrecv video transceiver and sends the live camera track', async () => {
    const videoTrack = { kind: 'video', readyState: 'live' };
    const audioTrack = { kind: 'audio', readyState: 'live' };
    const videoSender = createSender(null);
    const audioSender = createSender(audioTrack);
    const localStream = {
      getTracks: () => [audioTrack, videoTrack]
    };
    const peerConnection = {
      getSenders: vi.fn(() => [audioSender]),
      getTransceivers: vi.fn(() => []),
      addTrack: vi.fn(),
      addTransceiver: vi.fn(() => ({ sender: videoSender }))
    };

    await syncLocalTracks(peerConnection, localStream);

    expect(peerConnection.addTransceiver).toHaveBeenCalledWith('video', {
      direction: 'sendrecv',
      streams: [localStream]
    });
    expect(videoSender.setStreams).toHaveBeenCalledWith(localStream);
    expect(videoSender.replaceTrack).toHaveBeenCalledWith(videoTrack);
    expect(peerConnection.addTrack).not.toHaveBeenCalledWith(videoTrack, expect.anything());
  });

  it('reuses a remote-created video transceiver before creating an answer', async () => {
    const videoTrack = { kind: 'video', readyState: 'live' };
    const videoSender = createSender(null);
    const videoTransceiver = {
      direction: 'recvonly',
      sender: videoSender,
      receiver: {
        track: { kind: 'video' }
      }
    };
    const peerConnection = {
      getSenders: vi.fn(() => []),
      getTransceivers: vi.fn(() => [videoTransceiver]),
      addTrack: vi.fn(),
      addTransceiver: vi.fn()
    };
    const localStream = {
      getTracks: () => [videoTrack]
    };

    await syncLocalTracks(peerConnection, localStream);

    expect(videoTransceiver.direction).toBe('sendrecv');
    expect(videoSender.replaceTrack).toHaveBeenCalledWith(videoTrack);
    expect(peerConnection.addTransceiver).not.toHaveBeenCalled();
  });

  it('stops sending video with null instead of a black placeholder when the camera is off', async () => {
    const currentVideoTrack = { kind: 'video', readyState: 'live' };
    const audioTrack = { kind: 'audio', readyState: 'live' };
    const videoSender = createSender(currentVideoTrack);
    const peerConnection = {
      getSenders: vi.fn(() => [videoSender]),
      getTransceivers: vi.fn(() => []),
      addTrack: vi.fn(),
      addTransceiver: vi.fn()
    };

    await syncLocalTracks(peerConnection, {
      getTracks: () => [audioTrack]
    });

    expect(videoSender.replaceTrack).toHaveBeenCalledWith(null);
  });

  it('keeps a disabled live video track attached so camera unmute can resume frames', async () => {
    const disabledVideoTrack = { kind: 'video', readyState: 'live', enabled: false };
    const videoSender = createSender(disabledVideoTrack);
    const peerConnection = {
      getSenders: vi.fn(() => [videoSender]),
      getTransceivers: vi.fn(() => []),
      addTrack: vi.fn(),
      addTransceiver: vi.fn()
    };

    await syncLocalTracks(peerConnection, {
      getTracks: () => [disabledVideoTrack]
    });

    expect(videoSender.replaceTrack).not.toHaveBeenCalled();
  });
});

describe('getRemoteStreamFromTrackEvent', () => {
  it('uses the browser-provided remote stream when it exists', () => {
    const remoteStream = createMediaStream();

    expect(
      getRemoteStreamFromTrackEvent(null, {
        streams: [remoteStream],
        track: { id: 'video-1', kind: 'video' }
      })
    ).toBe(remoteStream);
  });

  it('creates a remote stream from a streamless track event', () => {
    const videoTrack = { id: 'video-1', kind: 'video' };
    stubMediaStreamConstructor();

    const remoteStream = getRemoteStreamFromTrackEvent(null, {
      streams: [],
      track: videoTrack
    });

    expect(remoteStream.getTracks()).toEqual([videoTrack]);
  });

  it('appends a streamless track to an existing remote stream only once', () => {
    const audioTrack = { id: 'audio-1', kind: 'audio' };
    const videoTrack = { id: 'video-1', kind: 'video' };
    const remoteStream = createMediaStream([audioTrack]);

    const nextStream = getRemoteStreamFromTrackEvent(remoteStream, {
      streams: [],
      track: videoTrack
    });
    const sameStream = getRemoteStreamFromTrackEvent(nextStream, {
      streams: [],
      track: videoTrack
    });

    expect(nextStream).toBe(remoteStream);
    expect(sameStream.getTracks()).toEqual([audioTrack, videoTrack]);
  });
});

describe('shouldInitiateConnection', () => {
  it('chooses only one side as the offer initiator for a participant pair', () => {
    expect(shouldInitiateConnection('socket-a', 'socket-b')).toBe(true);
    expect(shouldInitiateConnection('socket-b', 'socket-a')).toBe(false);
  });
});

function createSender(track) {
  const sender = {
    track,
    replaceTrack: vi.fn(async (nextTrack) => {
      sender.track = nextTrack;
    }),
    setStreams: vi.fn()
  };

  return sender;
}

function createMediaStream(initialTracks = []) {
  const tracks = [...initialTracks];

  return {
    addTrack: vi.fn((track) => {
      tracks.push(track);
    }),
    getTracks: vi.fn(() => tracks)
  };
}

function stubMediaStreamConstructor() {
  vi.stubGlobal(
    'MediaStream',
    vi.fn(function MediaStream() {
      return createMediaStream();
    })
  );
}
