import { describe, expect, it, vi } from 'vitest';
import {
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
});
