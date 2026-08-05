/**
 * Generates a conversation id on the device.
 *
 * The app names the conversation and the API creates it on first use, so a turn
 * is one request with no round trip to open a conversation first. That matters:
 * the thinking label has to be on screen within 500ms of the tap.
 *
 * Not `crypto.randomUUID()` — it is not present on every React Native runtime
 * this has to work on.
 */
export function newConversationId(): string {
  const random = (): string =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);

  return [
    random() + random(),
    random(),
    random(),
    random(),
    random() + random() + random(),
  ].join('-');
}
