import type { GenerationRequest } from '../../domain/ports/text-generation-port.ts';
import type { MessageContentBlock, MessageTurn } from './message-stream.ts';

/**
 * The domain's turns in the provider's vocabulary, ending with the question.
 *
 * Translation and nothing else. Which messages are here, what order they are
 * in, how a stopped answer is marked and how an earlier photo is described were
 * all settled in the domain before this was called. The judgements made here
 * are the two an adapter is allowed to make: that Anthropic calls the assistant
 * side "assistant", and what shape an image block has on this API.
 */
export function toMessageTurns(request: GenerationRequest): MessageTurn[] {
  const turns = request.history.map(
    (turn): MessageTurn => ({
      role: turn.author === 'assistant' ? 'assistant' : 'user',
      content: turn.text,
    }),
  );

  turns.push({ role: 'user', content: toQuestionContent(request) });
  return turns;
}

/**
 * The current question, with the photo attached to it when there is one.
 *
 * A turn with no image stays a plain string rather than a one-element block
 * array. Both are valid to the provider; the string is what every turn before
 * this slice sent, and keeping it means adding photos changed nothing about the
 * requests that do not have one.
 *
 * The image goes before the text. Anthropic's own guidance is that a question
 * read after the picture it is about produces better answers than the reverse,
 * and it is the order the person composed it in.
 */
function toQuestionContent(
  request: GenerationRequest,
): string | MessageContentBlock[] {
  const image = request.image;
  if (image === undefined) {
    return request.question;
  }

  return [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType,
        data: image.data,
      },
    },
    { type: 'text', text: request.question },
  ];
}
