export const DEFAULT_STUN_URLS = 'stun:stun.l.google.com:19302';

export function buildIceServers(stunUrls = DEFAULT_STUN_URLS) {
  const urls = stunUrls
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  return urls.length > 0
    ? [
        {
          urls
        }
      ]
    : [];
}

export function isPeerConnectionSupported() {
  return typeof globalThis.RTCPeerConnection === 'function';
}
