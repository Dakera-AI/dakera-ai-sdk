import { DakeraClient } from "@dakera-ai/dakera";
import type { ClientOptions } from "@dakera-ai/dakera";

/** Connection options shared by the middleware and tools helpers. */
export interface DakeraConnectionOptions {
  /**
   * A pre-configured {@link DakeraClient}. When provided, `apiUrl`/`apiKey`
   * are ignored and this client is used directly.
   */
  client?: DakeraClient;
  /** Dakera server base URL. Defaults to `$DAKERA_URL` or `http://localhost:3000`. */
  apiUrl?: string;
  /** Dakera API key (looks like `dk-...`). Defaults to `$DAKERA_API_KEY`. */
  apiKey?: string;
}

/** Default self-hosted Dakera server URL (see dakera-ai/dakera-deploy). */
export const DEFAULT_DAKERA_URL = "http://localhost:3000";

/**
 * Resolve a {@link DakeraClient} from connection options, falling back to
 * environment variables (`DAKERA_URL`, `DAKERA_API_KEY`) and finally the
 * default local server URL.
 */
export function resolveClient(options: DakeraConnectionOptions): DakeraClient {
  if (options.client) {
    return options.client;
  }
  const baseUrl = options.apiUrl ?? process.env["DAKERA_URL"] ?? DEFAULT_DAKERA_URL;
  const apiKey = options.apiKey ?? process.env["DAKERA_API_KEY"];
  const clientOpts: ClientOptions = {
    baseUrl,
    ...(apiKey !== undefined ? { apiKey } : {}),
  };
  return new DakeraClient(clientOpts);
}
