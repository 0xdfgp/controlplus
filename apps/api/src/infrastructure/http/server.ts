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

/**
 * The largest request this API accepts (ADR-029).
 *
 * Worth stating plainly, because base64 makes the two limits interact: a photo
 * is 4/3 of its size on the wire, so this cap bites at roughly 4.4MB of actual
 * image, below ADR-024's 5MB. That ordering is why the device checks the
 * resized size itself and shows the plain sentence before sending anything —
 * the domain rule is the backstop, not the thing the user meets.
 */
export const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
export function buildServer(
  dependencies: AskRouteDependencies,
): FastifyInstance {
  // Fastify's own logger is off: the one structured line per turn is written by
  // TurnLogger, which knows to send message content through redaction first.
  //
  // The body limit is ADR-029's: a request over 6MB is refused before it
  // reaches the provider. It is the outer backstop behind the 5MB photo rule in
  // ADR-024 and the device-side check that fires before either.
  const app = Fastify({ logger: false, bodyLimit: MAX_REQUEST_BYTES });

  app.get('/health', async () => ({ status: 'ok' }));

  registerAskRoute(app, dependencies);

  return app;
}
