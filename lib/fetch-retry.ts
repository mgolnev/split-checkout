/**
 * Повтор запросов при кратковременных сбоях (в т.ч. «засыпающая» БД / холодный пул:
 * 3–5 с до первого ответа). Не трогаем 4xx с явной клиентской ошибкой (кроме 408/429).
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Статусы, при которых разумно повторить тот же запрос (идемпотентные чтения/расчёты). */
const DEFAULT_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type FetchWithRetryOptions = {
  /** Число попыток (первая + повторы). По умолчанию 4. */
  maxAttempts?: number;
  /** Базовая задержка перед 2-й попыткой; перед N-й: baseDelayMs × (N − 1). По умолчанию 1200 мс. */
  baseDelayMs?: number;
  retryableStatuses?: ReadonlySet<number>;
};

/**
 * Обёртка над `fetch`: при сетевой ошибке или «временном» HTTP-коде ждёт и повторяет.
 * После исчерпания попыток возвращает последний ответ (если был) или пробрасывает исключение.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchWithRetryOptions,
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 1200;
  const retryableStatuses = options?.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(input, init);
      lastResponse = res;
      if (res.ok) return res;
      const retry = attempt < maxAttempts && retryableStatuses.has(res.status);
      if (retry) {
        await sleep(baseDelayMs * attempt);
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * attempt);
        continue;
      }
      throw e;
    }
  }

  if (lastResponse) return lastResponse;
  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError ?? "fetch failed"));
}
