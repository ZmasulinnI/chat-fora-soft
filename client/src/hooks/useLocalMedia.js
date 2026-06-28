import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  getMediaErrorCode,
  getMediaStatus,
  isWebRtcSupported,
  MEDIA_ERROR_MESSAGES,
  stopMediaStream
} from '../lib/media.js';

const initialLocalMediaState = {
  status: 'idle',
  stream: null,
  audioEnabled: false,
  videoEnabled: false,
  error: ''
};

function localMediaReducer(state, action) {
  switch (action.type) {
    case 'requesting':
      return {
        ...initialLocalMediaState,
        status: 'requesting'
      };
    case 'ready':
      return {
        status: 'ready',
        stream: action.stream,
        audioEnabled: action.audioEnabled,
        videoEnabled: action.videoEnabled,
        error: action.error ?? ''
      };
    case 'unsupported':
      return {
        ...initialLocalMediaState,
        status: 'unsupported',
        error: MEDIA_ERROR_MESSAGES.WEBRTC_UNSUPPORTED
      };
    case 'error':
      return {
        ...initialLocalMediaState,
        status: 'ready',
        error: action.message
      };
    default:
      return state;
  }
}

export function useLocalMedia() {
  const [state, dispatch] = useReducer(localMediaReducer, initialLocalMediaState);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function requestMedia() {
      dispatch({ type: 'requesting' });

      if (!isWebRtcSupported()) {
        dispatch({ type: 'unsupported' });
        return;
      }

      try {
        const result = await acquireLocalMedia();
        streamRef.current = result.stream;
        attachTrackEndHandlers(result.stream, dispatch);

        if (!active) {
          stopMediaStream(result.stream);
          if (streamRef.current === result.stream) {
            streamRef.current = null;
          }
          return;
        }

        dispatch({
          type: 'ready',
          stream: result.stream,
          ...getMediaStatus(result.stream),
          error: result.warning
        });
      } catch (error) {
        const errorCode = getMediaErrorCode(error);

        if (!active) {
          return;
        }

        dispatch({
          type: 'error',
          message: MEDIA_ERROR_MESSAGES[errorCode]
        });
      }
    }

    requestMedia();

    return () => {
      active = false;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const stopLocalMedia = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    dispatch({ type: 'ready', stream: null, audioEnabled: false, videoEnabled: false, error: '' });
  }, []);

  const toggleAudio = useCallback(async () => {
    if (!state.stream || state.status === 'unsupported') {
      return;
    }

    const [audioTrack] = state.stream.getAudioTracks();

    if (audioTrack) {
      audioTrack.enabled = !state.audioEnabled;
      dispatch({
        type: 'ready',
        stream: state.stream,
        ...getMediaStatus(state.stream),
        error: state.error
      });
      return;
    }

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const nextStream = new MediaStream([
        ...state.stream.getTracks(),
        ...audioStream.getAudioTracks()
      ]);

      streamRef.current = nextStream;
      attachTrackEndHandlers(nextStream, dispatch);
      dispatch({
        type: 'ready',
        stream: nextStream,
        ...getMediaStatus(nextStream),
        error: state.error
      });
    } catch (error) {
      dispatch({
        type: 'ready',
        stream: state.stream,
        ...getMediaStatus(state.stream),
        error: MEDIA_ERROR_MESSAGES[getMediaErrorCode(error)]
      });
    }
  }, [state.audioEnabled, state.error, state.status, state.stream]);

  const toggleVideo = useCallback(async () => {
    if (!state.stream || state.status === 'unsupported') {
      return;
    }

    if (state.videoEnabled) {
      for (const track of state.stream.getVideoTracks()) {
        track.enabled = false;
      }

      dispatch({
        type: 'ready',
        stream: state.stream,
        ...getMediaStatus(state.stream),
        error: state.error
      });
      return;
    }

    const disabledVideoTracks = state.stream
      .getVideoTracks()
      .filter((track) => track.readyState === 'live' && track.enabled === false);

    if (disabledVideoTracks.length > 0) {
      for (const track of disabledVideoTracks) {
        track.enabled = true;
      }

      dispatch({
        type: 'ready',
        stream: state.stream,
        ...getMediaStatus(state.stream),
        error: state.error
      });
      return;
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      const nextStream = new MediaStream([
        ...state.stream.getTracks(),
        ...videoStream.getVideoTracks()
      ]);

      streamRef.current = nextStream;
      attachTrackEndHandlers(nextStream, dispatch);
      dispatch({
        type: 'ready',
        stream: nextStream,
        ...getMediaStatus(nextStream),
        error: state.error
      });
    } catch (error) {
      dispatch({
        type: 'ready',
        stream: state.stream,
        ...getMediaStatus(state.stream),
        error: MEDIA_ERROR_MESSAGES[getMediaErrorCode(error)]
      });
    }
  }, [state.error, state.status, state.stream, state.videoEnabled]);

  return {
    ...state,
    toggleAudio,
    toggleVideo,
    stopLocalMedia
  };
}

async function acquireLocalMedia() {
  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      }),
      warning: ''
    };
  } catch (error) {
    const errorCode = getMediaErrorCode(error);

    if (errorCode === 'MEDIA_PERMISSION_DENIED') {
      throw error;
    }

    const [audioResult, videoResult] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    ]);
    const tracks = [];

    if (audioResult.status === 'fulfilled') {
      tracks.push(...audioResult.value.getAudioTracks());
    }

    if (videoResult.status === 'fulfilled') {
      tracks.push(...videoResult.value.getVideoTracks());
    }

    if (tracks.length === 0) {
      throw error;
    }

    return {
      stream: new MediaStream(tracks),
      warning: MEDIA_ERROR_MESSAGES[errorCode]
    };
  }
}

function attachTrackEndHandlers(stream, dispatch) {
  for (const track of stream.getTracks()) {
    track.addEventListener(
      'ended',
      () => {
        dispatch({
          type: 'ready',
          stream,
          ...getMediaStatus(stream),
          error: 'Устройство стало недоступно'
        });
      },
      { once: true }
    );
  }
}
