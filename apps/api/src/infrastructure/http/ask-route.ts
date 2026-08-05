import type { FastifyInstance } from 'fastify';

import { isAskQuestionRequest } from '@control-plus/contracts';
import type { StreamErrorClass } from '@control-plus/contracts';

import type { AskQuestion } from '../../application/ask-question.ts';
import type { AskQuestionImage } from '../../application/user-message.ts';
import { ConversationId } from '../../domain/value-objects/conversation-id.ts';
import type { Clock } from '../../domain/ports/clock.ts';
import type { TurnLogger } from '../logging/turn-logger.ts';
import { decodeImageAttachment } from './image-attachment.ts';
import { SseWriter } from './sse-writer.ts';

export interface AskRouteDependencies {
  readonly askQuestion: AskQuestion;
  readonly turnLogger: TurnLogger;
  readonly clock: Clock;
}

const KNOWN_ERROR_CLASSES: readonly StreamErrorClass[] = [
  'ProviderUnavailable',
  'ConversationNotFound',
  'AttachmentTooLarge',
];

function toStreamErrorClass(name: string): StreamErrorClass {
  return KNOWN_ERROR_CLASSES.includes(name as StreamErrorClass)
    ? (name as StreamErrorClass)
    : 'ProviderUnavailable';
}

/**
 * POST /conversations/:conversationId/messages
 *
 * One request per turn, answered as text/event-stream (ADR-016).
 *
 * stage(thinking) goes out before anything else, including before the provider
 * is called, so the screen can stop being blank inside 500ms of the tap. The
 * label changes to responding on the first delta, not on a timer.
 */
export function registerAskRoute(
  app: FastifyInstance,
  dependencies: AskRouteDependencies,
): void {
  app.post('/conversations/:conversationId/messages', async (request, reply) => {
    const { conversationId: rawId } = request.params as {
      conversationId: string;
    };

    if (!isAskQuestionRequest(request.body)) {
      return reply
        .code(400)
        .send({ error: 'A question is required.' });
    }

    let conversationId: ConversationId;
    try {
      conversationId = ConversationId.fromString(rawId);
    } catch {
      return reply.code(400).send({ error: 'A conversation id is required.' });
    }

    const question = request.body.question;

    // Decoded before the stream is hijacked, so an unreadable photo is a 400
    // with a body rather than an error event on a stream that then closes. The
    // size is not judged here: that is a domain rule with a domain error.
    let image: AskQuestionImage | undefined;
    if (request.body.image !== undefined) {
      try {
        image = decodeImageAttachment(request.body.image);
      } catch {
        return reply.code(400).send({ error: 'The photo could not be read.' });
      }
    }

    const startedAt = dependencies.clock.now().getTime();
    const sse = new SseWriter(reply.raw);

    reply.hijack();
    sse.open();
    sse.send({ type: 'stage', stage: 'thinking' });

    let responding = false;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let thoughtTokens: number | null = null;
    let terminalState: 'completed' | 'stopped' | null = null;
    let errorClass: string | null = null;

    // The user tapping Stop is the client aborting the request (ADR-016), so
    // the connection going away is the whole signal.
    //
    // It has to be the response that is watched, not the request. Since Node 16
    // an IncomingMessage emits 'close' once its body has been read, which for a
    // one-line JSON POST is immediately — watching that reports every single
    // turn as stopped. A ServerResponse emits 'close' either when the response
    // finished or when the connection died first, and `writableEnded` is what
    // separates the two.
    let clientGone = false;
    reply.raw.on('close', () => {
      clientGone = !reply.raw.writableEnded;
    });

    try {
      for await (const event of dependencies.askQuestion.execute({
        conversationId,
        question,
        image,
      })) {
        if (clientGone) {
          // Cancellation is stopping iteration (ADR-012). Breaking makes the
          // loop call return() on the use case, which releases the provider
          // stream and writes the partial answer as stopped.
          //
          // The flag is checked between events rather than raced against the
          // next one because an async generator queues return() behind an
          // in-flight next() either way: neither shape can interrupt a provider
          // that is mid-silence. Stop only exists in the responding state,
          // where deltas are arriving, so in practice this lands at once.
          terminalState = 'stopped';
          break;
        }

        if (event.kind === 'delta') {
          if (!responding) {
            responding = true;
            sse.send({ type: 'stage', stage: 'responding' });
          }
          sse.send({ type: 'message.delta', text: event.text });
          continue;
        }

        if (event.kind === 'completed') {
          const { message } = event;
          terminalState = message.state ?? 'completed';
          inputTokens = message.usage?.inputTokens.value ?? null;
          outputTokens = message.usage?.outputTokens.value ?? null;
          thoughtTokens = message.usage?.thoughtTokens.value ?? null;
          sse.send({
            type: 'message.done',
            messageId: message.id.value,
            state: message.state ?? 'completed',
            provenance: {
              origin: 'ai-generated',
              modelId: message.provenance?.modelId.value ?? '',
              provider: message.provenance?.provider ?? '',
            },
            usage: {
              inputTokens: inputTokens ?? 0,
              outputTokens: outputTokens ?? 0,
              thoughtTokens: thoughtTokens ?? 0,
            },
          });
          continue;
        }

        errorClass = event.event.errorClass;
        sse.send({ type: 'error', error: toStreamErrorClass(errorClass) });
      }
    } catch (caught) {
      // The use case turns generation failures into `failed` events. Anything
      // arriving here is unexpected, and the user still gets one plain event.
      errorClass = caught instanceof Error ? caught.name : 'ProviderUnavailable';
      sse.send({ type: 'error', error: toStreamErrorClass(errorClass) });
    } finally {
      sse.close();
      dependencies.turnLogger.record({
        conversationId: conversationId.value,
        requestId: request.id,
        latencyMs: dependencies.clock.now().getTime() - startedAt,
        question,
        // That the turn carried a photo, what kind and how big. Never the
        // bytes and never the hash: the operator needs to know an image was in
        // the request when they read a strange input token count, and nothing
        // more than that.
        image:
          image === undefined
            ? null
            : {
                mediaType: image.mediaType,
                width: image.width,
                height: image.height,
              },
        inputTokens,
        outputTokens,
        thoughtTokens,
        terminalState,
        errorClass,
      });
    }
  });
}
