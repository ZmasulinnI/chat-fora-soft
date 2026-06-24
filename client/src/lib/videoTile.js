export function getInitials(displayName) {
  const letters = String(displayName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

  return letters || '?';
}

export function hasLiveVideoTrack(stream, media = {}) {
  return Boolean(
    stream?.getVideoTracks?.().some((track) => track.readyState === 'live') && media.videoEnabled !== false
  );
}

export function getVideoFallbackLabel(media = {}) {
  return media.videoEnabled === false ? 'камера выключена' : 'видео недоступно';
}

export function isAudioMuted(media = {}) {
  return media.audioEnabled === false;
}
