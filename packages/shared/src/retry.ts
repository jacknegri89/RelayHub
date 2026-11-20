const BASE_DELAY_MS = 1000;
const MAX_BACKOFF_MS = 300_000;
const MAX_RETRY_AFTER_MS = 900_000;

export function classifyStatus(status: number) {
  if (status >= 200 && status <= 299) {
    return "success";
  }
  if (status === 429 || (status >= 500 && status <= 599)) {
    return "retry";
  }
  return "permanent";
}

export function retryDelay(
  attempt: number,
  retryAfter: string | undefined,
  now = Date.now(),
  random = Math.random(),
) {
  const backoff = Math.min(
    MAX_BACKOFF_MS,
    BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
  let requestedDelay = 0;
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    requestedDelay = Number(retryAfter) * 1000;
  } else if (retryAfter) {
    requestedDelay = Date.parse(retryAfter) - now || 0;
  }
  return Math.max(
    Math.round(backoff * (0.5 + 0.5 * random)),
    Math.min(MAX_RETRY_AFTER_MS, requestedDelay),
  );
}
