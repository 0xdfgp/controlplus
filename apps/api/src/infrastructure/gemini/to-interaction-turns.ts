import type { GenerationRequest } from '../../domain/ports/text-generation-port.ts';
import type { InteractionContentBlock, InteractionTurn } from './interaction-stream.ts';

/**
 * The domain's turns in the provider's vocabulary, ending with the question.
 *
 * Translation and nothing else. Which messages are here, what order they are
 * in, how a stopped answer is marked and how an earlier photo is described were
 * all settled in the domain before this was called. The judgements made here
 * are the two an adapter is allowed to make: that Gemini calls the assistant
 * side "model", and what shape an image block has on this API.
 *
 * Extracted from the adapter when image support was added, so the file mirrors
 * to-message-turns.ts on the Anthropic side. Two providers behind one port read
 * better when the same job lives in the same place on both.
 */
export function toInteractionTurns(request: GenerationRequest): InteractionTurn[] {
  const turns = request.history.map(
    (turn): InteractionTurn => ({
      role: turn.author === 'assistant' ? 'model' : 'user',
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
 * array, for the same reason as on the Anthropic side: it is what every
 * text-only turn already sent, so adding photos changes nothing about the
 * requests that do not have one.
 *
 * The image goes before the text, matching the order the person composed it in
 * and the order the Anthropic adapter already uses. A comparison between two
 * providers is only about the providers if both were asked the same way.
 */
function toQuestionContent(
  request: GenerationRequest,
): string | InteractionContentBlock[] {
  const image = request.image;
  if (image === undefined) {
    return request.question;
  }

  return [
    { type: 'image', mime_type: image.mediaType, data: image.data },
    { type: 'text', text: request.question },
  ];
}
