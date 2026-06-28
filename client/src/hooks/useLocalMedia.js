import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  getMediaDeviceErrorMessage,
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
  error: '',
  audioError: '',
  videoError: ''
};

function localMediaReducer(state, action) {
  switch (action.type) {
    case 'requesting':
      return {
        ...initialLocalMediaState,
        status: 'requesting'
      };
    case 'ready':
      {
        const audioError = action.audioError ?? state.audioError;
        const videoError = action.videoError ?? state.videoError;

        return {
          status: 'ready',
          stream: action.stream,
          audioEnabled: action.audioEnabled,
          videoEnabled: action.videoEnabled,
          error: action.error ?? '',
          audioError,
          videoError
        };
      }
    case 'device-error':
      return {
        ...state,
        status: 'ready',
        audioError: action.kind === 'audio' ? action.message : state.audioError,
        videoError: action.kind === 'video' ? action.message : state.videoError
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
        error: action.message,
        audioError: action.message,
        videoError: action.message
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
          audioError: result.audioError,
          videoError: result.videoError
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
    dispatch({
      type: 'ready',
      stream: null,
      audioEnabled: false,
      videoEnabled: false,
      error: '',
      audioError: '',
      videoError: ''
    });
  }, []);

  const toggleAudio = useCallback(async () => {
    if (!state.stream || state.status === 'unsupported' || state.audioError) {
      return;
    }

    const [audioTrack] = state.stream.getAudioTracks();

    if (audioTrack) {
      audioTrack.enabled = !state.audioEnabled;
      dispatch({
        type: 'ready',
        stream: state.stream,
        ...getMediaStatus(state.stream),
        error: state.error,
        audioError: ''
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
        error: state.error,
        audioError: ''
      });
    } catch (error) {
      dispatch({
        type: 'ready',
        stream: state.stream,
        ...getMediaStatus(state.stream),
        error: state.error,
        audioError: getMediaDeviceErrorMessage('audio', getMediaErrorCode(error))
      });
    }
  }, [state.audioEnabled, state.audioError, state.error, state.status, state.stream]);

  const toggleVideo = useCallback(async () => {
    if (!state.stream || state.status === 'unsupported' || state.videoError) {
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
        error: state.error,
        videoError: ''
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
        error: state.error,
        videoError: ''
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
        error: state.error,
        videoError: ''
      });
    } catch (error) {
      dispatch({
        type: 'ready',
        stream: state.stream,
        ...getMediaStatus(state.stream),
        error: state.error,
        videoError: getMediaDeviceErrorMessage('video', getMediaErrorCode(error))
      });
    }
  }, [state.error, state.status, state.stream, state.videoEnabled, state.videoError]);

  return {
    ...state,
    toggleAudio,
    toggleVideo,
    stopLocalMedia
  };
}

async function acquireLocalMedia() {
  const [audioResult, videoResult] = await Promise.allSettled([
    navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  ]);
  const tracks = [];
  let audioError = '';
  let videoError = '';

  if (audioResult.status === 'fulfilled') {
    tracks.push(...audioResult.value.getAudioTracks());
  } else {
    audioError = getMediaDeviceErrorMessage('audio', getMediaErrorCode(audioResult.reason));
  }

  if (videoResult.status === 'fulfilled') {
    tracks.push(...videoResult.value.getVideoTracks());
  } else {
    videoError = getMediaDeviceErrorMessage('video', getMediaErrorCode(videoResult.reason));
  }

  return {
    stream: new MediaStream(tracks),
    audioError,
    videoError
  };
}

function attachTrackEndHandlers(stream, dispatch) {
  for (const track of stream.getTracks()) {
    track.addEventListener(
      'ended',
      () => {
        const kind = track.kind === 'audio' ? 'audio' : 'video';

        dispatch({
          type: 'device-error',
          kind,
          message: kind === 'audio' ? 'Микрофон стал недоступен' : 'Камера стала недоступна'
        });
      },
      { once: true }
    );
  }
}
