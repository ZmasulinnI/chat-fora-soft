export const MEDIA_ERROR_MESSAGES = {
  WEBRTC_UNSUPPORTED: 'Браузер не поддерживает WebRTC',
  MEDIA_PERMISSION_DENIED: 'Нет доступа к камере или микрофону',
  MEDIA_DEVICE_NOT_FOUND: 'Камера или микрофон не найдены',
  MEDIA_DEVICE_BUSY: 'Камера или микрофон недоступны',
  MEDIA_UNKNOWN_ERROR: 'Не удалось получить доступ к камере или микрофону'
};

export function isWebRtcSupported(navigatorLike = globalThis.navigator) {
  return Boolean(
    globalThis.RTCPeerConnection &&
      navigatorLike?.mediaDevices &&
      typeof navigatorLike.mediaDevices.getUserMedia === 'function'
  );
}

export function getMediaErrorCode(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'MEDIA_PERMISSION_DENIED';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'MEDIA_DEVICE_NOT_FOUND';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'MEDIA_DEVICE_BUSY';
    default:
      return 'MEDIA_UNKNOWN_ERROR';
  }
}

export function getMediaStatus(stream) {
  const audioEnabled = Boolean(stream?.getAudioTracks?.().some((track) => track.readyState === 'live'));
  const videoEnabled = Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live'));

  return {
    audioEnabled,
    videoEnabled
  };
}

export function stopMediaStream(stream) {
  for (const track of stream?.getTracks?.() ?? []) {
    track.stop();
  }
}
