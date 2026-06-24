import { describe, expect, it } from 'vitest';
import { getInitials, getVideoFallbackLabel, hasLiveVideoTrack, isAudioMuted } from './videoTile.js';

describe('getInitials', () => {
  it('builds initials from a display name', () => {
    expect(getInitials('Алексей Иванов')).toBe('АИ');
    expect(getInitials('Мария')).toBe('М');
    expect(getInitials('')).toBe('?');
  });
});

describe('hasLiveVideoTrack', () => {
  it('requires a live video track and enabled media state', () => {
    const stream = {
      getVideoTracks: () => [{ readyState: 'live' }]
    };

    expect(hasLiveVideoTrack(stream, { videoEnabled: true })).toBe(true);
    expect(hasLiveVideoTrack(stream, { videoEnabled: false })).toBe(false);
  });
});

describe('getVideoFallbackLabel', () => {
  it('describes disabled and unavailable video states', () => {
    expect(getVideoFallbackLabel({ videoEnabled: false })).toBe('камера выключена');
    expect(getVideoFallbackLabel({ videoEnabled: true })).toBe('видео недоступно');
  });
});

describe('isAudioMuted', () => {
  it('detects muted audio state', () => {
    expect(isAudioMuted({ audioEnabled: false })).toBe(true);
    expect(isAudioMuted({ audioEnabled: true })).toBe(false);
  });
});
