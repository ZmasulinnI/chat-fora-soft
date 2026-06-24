export function normalizeOutgoingMessage(text) {
  return String(text ?? '').trim();
}

export function canSendMessage(text) {
  return normalizeOutgoingMessage(text).length > 0;
}

export function formatMessageTime(timestamp, dateFactory = (value) => new Date(value)) {
  const date = dateFactory(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}
