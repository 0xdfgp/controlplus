import type { FastifyInstance } from 'fastify';

import { AskQuestion } from '../application/ask-question.ts';
import { ProductPolicy } from '../domain/policy/product-policy.ts';
import { AnswerGeneration } from '../domain/services/answer-generation.ts';
import { ModelId } from '../domain/value-objects/model-id.ts';
import { AnthropicTextGenerationAdapter } from './anthropic/anthropic-text-generation-adapter.ts';
import { AnthropicMessageStreamOpener } from './anthropic/message-stream.ts';
import type { MessageStreamOpener } from './anthropic/message-stream.ts';
import { SystemClock } from './clock/system-clock.ts';
import type { AppConfig } from './config/load-config.ts';
import { buildServer } from './http/server.ts';
import { UuidIdGenerator } from './ids/uuid-id-generator.ts';
import { TurnLogger } from './logging/turn-logger.ts';
import { migrate, openDatabase } from './persistence/database.ts';
import type { Database } from './persistence/database.ts';
import { DrizzleConversationRepository } from './persistence/drizzle-conversation-repository.ts';
import { DrizzleMessageRepository } from './persistence/drizzle-message-repository.ts';

export interface Application {
  readonly server: FastifyInstance;
  readonly database: Database;
  close(): Promise<void>;
}

/**
 * The one place an adapter is constructed.
 *
 * Nothing else in the codebase calls `new` on an adapter. If a second place
 * needs a repository or a provider client, it takes it as a constructor
 * argument and this function supplies it.
 *
 * `overrides` exists for the end-to-end test, which runs the real HTTP stack
 * and the real database against a stubbed provider. It is the seam that keeps
 * that test honest without the test reaching inside the wiring.
 */
export function composeApplication(
  config: AppConfig,
  overrides: {
    readonly streamOpener?: MessageStreamOpener;
    readonly logSink?: (line: string) => void;
  } = {},
): Application {
  const database = openDatabase(config.databaseUrl);

  const clock = new SystemClock();
  const idGenerator = new UuidIdGenerator();
  const policy = ProductPolicy.current();

  // Anthropic is the wired provider (ADR-032, superseding ADR-017). The Gemini
  // adapter is still in the tree and still passes the same port contract; it is
  // not wired, and wiring it is the whole of S10's work on this side.
  const streamOpener =
    overrides.streamOpener ??
    AnthropicMessageStreamOpener.withApiKey(config.anthropicApiKey);

  const textGeneration = new AnthropicTextGenerationAdapter(
    streamOpener,
    ModelId.fromString(config.anthropicModel),
  );

  const answerGeneration = new AnswerGeneration(
    textGeneration,
    clock,
    idGenerator,
    policy,
  );

  const askQuestion = new AskQuestion(
    new DrizzleConversationRepository(database.db),
    new DrizzleMessageRepository(database.db),
    answerGeneration,
    clock,
    idGenerator,
  );

  const turnLogger =
    overrides.logSink === undefined
      ? TurnLogger.toStdout(config.logLevel !== 'silent')
      : new TurnLogger(overrides.logSink, true);

  const server = buildServer({ askQuestion, turnLogger, clock });

  return {
    server,
    database,
    close: async () => {
      await server.close();
      await database.close();
    },
  };
}

export async function migrateApplication(config: AppConfig): Promise<void> {
  const database = openDatabase(config.databaseUrl);
  try {
    await migrate(database);
  } finally {
    await database.close();
  }
}
