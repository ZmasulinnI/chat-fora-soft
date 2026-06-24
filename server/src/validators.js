export const MAX_DISPLAY_NAME_LENGTH = 30;
export const MAX_CHAT_MESSAGE_LENGTH = 1000;

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;
const DISPLAY_NAME_ALLOWED_PATTERN = /^[\p{L}\p{N} '-]+$/u;
const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/g;

export class ValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.details = details;
  }
}

export function validateRoomId(roomId) {
  if (typeof roomId !== 'string') {
    throw new ValidationError('VALIDATION_ERROR', 'Некорректный идентификатор комнаты');
  }

  const normalizedRoomId = roomId.trim();

  if (!ROOM_ID_PATTERN.test(normalizedRoomId)) {
    throw new ValidationError('VALIDATION_ERROR', 'Некорректный идентификатор комнаты');
  }

  return normalizedRoomId;
}

export function normalizeDisplayName(displayName) {
  if (typeof displayName !== 'string') {
    throw new ValidationError('VALIDATION_ERROR', 'Введите имя');
  }

  const normalizedName = displayName.replace(CONTROL_CHARS_PATTERN, '').trim();

  if (!normalizedName) {
    throw new ValidationError('VALIDATION_ERROR', 'Введите имя');
  }

  const clippedName = [...normalizedName].slice(0, MAX_DISPLAY_NAME_LENGTH).join('').trim();

  if (!clippedName) {
    throw new ValidationError('VALIDATION_ERROR', 'Введите имя');
  }

  if (!DISPLAY_NAME_ALLOWED_PATTERN.test(clippedName)) {
    throw new ValidationError(
      'VALIDATION_ERROR',
      'Имя может содержать только буквы, цифры, пробел, дефис и апостроф'
    );
  }

  return clippedName;
}

export function normalizeChatMessage(text) {
  if (typeof text !== 'string') {
    throw new ValidationError('VALIDATION_ERROR', 'Введите сообщение');
  }

  const normalizedText = text.replace(CONTROL_CHARS_PATTERN, '').trim();

  if (!normalizedText) {
    throw new ValidationError('VALIDATION_ERROR', 'Введите сообщение');
  }

  const clippedText = [...normalizedText].slice(0, MAX_CHAT_MESSAGE_LENGTH).join('').trim();

  if (!clippedText) {
    throw new ValidationError('VALIDATION_ERROR', 'Введите сообщение');
  }

  return clippedText;
}

export function toErrorResponse(error) {
  if (error instanceof ValidationError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  return {
    ok: false,
    code: 'SERVER_ERROR',
    message: 'Внутренняя ошибка сервера'
  };
}
