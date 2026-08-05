/**
 * The wire request for a turn. Hand written, imported by the API and the app.
 *
 * One request per turn (ADR-016). The conversation id travels in the path, not
 * the body: POST /conversations/:conversationId/messages
 */
export interface AskQuestionRequest {
  /** The question exactly as the user typed it. */
  readonly question: string;
}

/**
 * Narrows an unknown body to AskQuestionRequest.
 *
 * The HTTP layer validates shape only. It never constructs Provenance and it
 * never decides whether a message is assistant-authored; the domain does both.
 */
export function isAskQuestionRequest(
  value: unknown,
): value is AskQuestionRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const question = (value as { question?: unknown }).question;
  return typeof question === 'string' && question.trim().length > 0;
}
