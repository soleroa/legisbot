const USER_AGENT =
  "LegisBotScraper/1.0 (+https://github.com/; contacto: msoleroa@gmail.com) Node.js";

const DEFAULT_DELAY_MS = 800;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchOptions {
  delayMs?: number;
  retries?: number;
}

/**
 * Fetches a URL with a respectful delay before the request, a identified
 * User-Agent, and retry with exponential backoff on failure or 429/5xx.
 */
export async function politeFetch(
  url: string,
  opts: FetchOptions = {}
): Promise<string> {
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const retries = opts.retries ?? MAX_RETRIES;

  await sleep(delayMs);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/javascript,*/*",
        },
      });

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url} (non-retryable)`);
      }
      return await res.text();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `  [fetch retry ${attempt + 1}/${retries}] ${url} -> ${(err as Error).message}. Esperando ${backoff}ms...`
        );
        await sleep(backoff);
      }
    }
  }
  throw new Error(
    `politeFetch: agotados los reintentos para ${url}: ${(lastError as Error)?.message}`
  );
}
