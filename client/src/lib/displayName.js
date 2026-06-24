export const MAX_DISPLAY_NAME_LENGTH = 30;

const DISPLAY_NAME_ALLOWED_PATTERN = /^[\p{L}\p{N} '-]+$/u;
const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/g;

export function validateDisplayName(displayName) {
  if (typeof displayName !== 'string') {
    return {
      ok: false,
      value: '',
      error: 'Введите имя'
    };
  }

  const normalizedName = displayName.replace(CONTROL_CHARS_PATTERN, '').trim();

  if (!normalizedName) {
    return {
      ok: false,
      value: '',
      error: 'Введите имя'
    };
  }

  const clippedName = [...normalizedName].slice(0, MAX_DISPLAY_NAME_LENGTH).join('').trim();

  if (!DISPLAY_NAME_ALLOWED_PATTERN.test(clippedName)) {
    return {
      ok: false,
      value: clippedName,
      error: 'Имя может содержать только буквы, цифры, пробел, дефис и апостроф'
    };
  }

  return {
    ok: true,
    value: clippedName,
    error: ''
  };
}
