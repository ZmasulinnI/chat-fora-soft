import { describe, expect, it } from 'vitest';
import { buildIceServers } from './webrtc.js';

describe('buildIceServers', () => {
  it('builds ICE server config from comma-separated STUN urls', () => {
    expect(buildIceServers('stun:a.example, stun:b.example')).toEqual([
      {
        urls: ['stun:a.example', 'stun:b.example']
      }
    ]);
  });

  it('returns an empty list for empty config', () => {
    expect(buildIceServers('')).toEqual([]);
  });
});
