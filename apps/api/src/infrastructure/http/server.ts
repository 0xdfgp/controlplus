import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { registerAskRoute } from './ask-route.ts';
import type { AskRouteDependencies } from './ask-route.ts';

/**
 * The HTTP surface.
 *
 * No compression plugin is registered at all. The one streaming route in this
 * slice must not be buffered, and a global compressor would buffer it (ADR-016).
 */
export function buildServer(
  dependencies: AskRouteDependencies,
): FastifyInstance {
  // Fastify's own logger is off: the one structured line per turn is written by
  // TurnLogger, which knows to send message content through redaction first.
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  registerAskRoute(app, dependencies);

  return app;
}
