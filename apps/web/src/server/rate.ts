import { withinLimit } from "@relayhub/db/rate-limit";
import { HttpError } from "./http";

export async function throttle(key: string, limit: number) {
  if (!(await withinLimit(key, limit, 60))) {
    throw new HttpError(429, "rate_limited");
  }
}
