/**
 * The generation provider returned an error or could not be reached.
 *
 * The adapter translates every provider failure into this one domain error, so
 * nothing above the port branches on an SDK error type. The `cause` keeps the
 * original for the log line; it never reaches the user, who sees a plain
 * sentence with no code and no provider text.
 *
 * Timeouts, retries and fallback are S9 and S10.
 */
export class ProviderUnavailable extends Error {
  override readonly name = 'ProviderUnavailable';

  constructor(
    readonly provider: string,
    options?: { readonly cause?: unknown },
  ) {
    super(
      `The ${provider} provider is unavailable.`,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
  }
}
