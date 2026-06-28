import { describe, expect, it, vi } from 'vitest';
import {
  getMediaDeviceErrorMessage,
  getMediaErrorCode,
  getMediaStatus,
  isWebRtcSupported,
  MEDIA_ERROR_MESSAGES,
  stopMediaStream
} from './media.js';

describe('isWebRtcSupported', () => {
  it('requires RTCPeerConnection and getUserMedia', () => {
    const originalPeerConnection = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = function RTCPeerConnection() {};

    expect(
      isWebRtcSupported({
        mediaDevices: {
          getUserMedia: () => {}
        }
      })
    ).toBe(true);

    globalThis.RTCPeerConnection = originalPeerConnection;
  });

  it('returns false when getUserMedia is unavailable', () => {
    const originalPeerConnection = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = function RTCPeerConnection() {};

    expect(isWebRtcSupported({ mediaDevices: {} })).toBe(false);
    expect(isWebRtcSupported({})).toBe(false);

    globalThis.RTCPeerConnection = originalPeerConnection;
  });
});

describe('getMediaErrorCode', () => {
  it('maps browser media errors to app codes', () => {
    expect(getMediaErrorCode({ name: 'NotAllowedError' })).toBe('MEDIA_PERMISSION_DENIED');
    expect(getMediaErrorCode({ name: 'NotFoundError' })).toBe('MEDIA_DEVICE_NOT_FOUND');
    expect(getMediaErrorCode({ name: 'NotReadableError' })).toBe('MEDIA_DEVICE_BUSY');
    expect(getMediaErrorCode({ name: 'OtherError' })).toBe('MEDIA_UNKNOWN_ERROR');
    expect(MEDIA_ERROR_MESSAGES.MEDIA_PERMISSION_DENIED).toBe('Нет доступа к камере или микрофону');
  });
});

describe('getMediaDeviceErrorMessage', () => {
  it('builds device-specific media error messages', () => {
    expect(getMediaDeviceErrorMessage('audio', 'MEDIA_PERMISSION_DENIED')).toBe('Нет доступа к микрофону');
    expect(getMediaDeviceErrorMessage('video', 'MEDIA_PERMISSION_DENIED')).toBe('Нет доступа к камере');
    expect(getMediaDeviceErrorMessage('audio', 'MEDIA_DEVICE_NOT_FOUND')).toBe('Микрофон не найден');
    expect(getMediaDeviceErrorMessage('video', 'MEDIA_DEVICE_BUSY')).toBe('Камера недоступна');
  });
});

describe('getMediaStatus', () => {
  it('detects live audio and video tracks', () => {
    const stream = {
      getAudioTracks: () => [{ readyState: 'live' }],
      getVideoTracks: () => [{ readyState: 'ended' }, { readyState: 'live' }]
    };

    expect(getMediaStatus(stream)).toEqual({
      audioEnabled: true,
      videoEnabled: true
    });
  });

  it('treats ended or missing tracks as disabled media', () => {
    expect(
      getMediaStatus({
        getAudioTracks: () => [{ readyState: 'ended' }],
        getVideoTracks: () => []
      })
    ).toEqual({
      audioEnabled: false,
      videoEnabled: false
    });

    expect(getMediaStatus(null)).toEqual({
      audioEnabled: false,
      videoEnabled: false
    });
  });

  it('treats disabled live tracks as disabled media', () => {
    expect(
      getMediaStatus({
        getAudioTracks: () => [{ readyState: 'live', enabled: false }],
        getVideoTracks: () => [{ readyState: 'live', enabled: false }]
      })
    ).toEqual({
      audioEnabled: false,
      videoEnabled: false
    });
  });
});

describe('stopMediaStream', () => {
  it('stops every track', () => {
    const firstTrack = { stop: vi.fn() };
    const secondTrack = { stop: vi.fn() };

    stopMediaStream({
      getTracks: () => [firstTrack, secondTrack]
    });

    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(secondTrack.stop).toHaveBeenCalledOnce();
  });

  it('does not throw for a missing stream', () => {
    expect(() => stopMediaStream(null)).not.toThrow();
  });
});
