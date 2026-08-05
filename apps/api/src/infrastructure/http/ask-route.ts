import type { FastifyInstance } from 'fastify';

import { isAskQuestionRequest } from '@control-plus/contracts';
import type { StreamErrorClass } from '@control-plus/contracts';

import type { AskQuestion } from '../../application/ask-question.ts';
import { ConversationId } from '../../domain/value-objects/conversation-id.ts';
import type { Clock } from '../../domain/ports/clock.ts';
import type { TurnLogger } from '../logging/turn-logger.ts';
import { SseWriter } from './sse-writer.ts';

export interface AskRouteDependencies {
  readonly askQuestion: AskQuestion;
  readonly turnLogger: TurnLogger;
  readonly clock: Clock;
}

const KNOWN_ERROR_CLASSES: readonly StreamErrorClass[] = [
  'ProviderUnavailable',
  'ConversationNotFound',
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
    const startedAt = dependencies.clock.now().getTime();
    const sse = new SseWriter(reply.raw);

    reply.hijack();
    sse.open();
    sse.send({ type: 'stage', stage: 'thinking' });

    let responding = false;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let thoughtTokens: number | null = null;
    let errorClass: string | null = null;

    try {
      for await (const event of dependencies.askQuestion.execute({
        conversationId,
        question,
      })) {
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
        inputTokens,
        outputTokens,
        thoughtTokens,
        errorClass,
      });
    }
  });
}
