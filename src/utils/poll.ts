import { TimeoutError } from "../errors/index.js";

const DEFAULT_INTERVAL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 120_000;

export async function poll<T>(
  jobId: string,
  fn: () => Promise<T>,
  isDone: (result: T) => boolean,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<T> {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const result = await fn();
    if (isDone(result)) {
      return result;
    }

    if (Date.now() >= deadline) {
      throw new TimeoutError(jobId, timeoutMs);
    }

    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
