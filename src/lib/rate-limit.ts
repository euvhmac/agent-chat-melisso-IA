import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** Burst: 5 msgs / 10s — bloqueia curl loops e spam rápido */
const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "10 s"),
  prefix: "rl:burst",
});

/** Horário: 20 msgs / 1h — generoso pra recrutador real */
const hourlyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"),
  prefix: "rl:hourly",
});

/** Diário: 50 msgs / 24h — cap pra proteger budget de tokens */
const dailyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, "24 h"),
  prefix: "rl:daily",
});

/** Checa 3 camadas em paralelo. Retorna a primeira que falhar. */
export const checkRateLimit = async (
  ip: string,
): Promise<{ limited: boolean; retryAfter?: number }> => {
  const [burst, hourly, daily] = await Promise.all([
    burstLimiter.limit(ip),
    hourlyLimiter.limit(ip),
    dailyLimiter.limit(ip),
  ]);

  if (!burst.success) {
    return { limited: true, retryAfter: Math.ceil((burst.reset - Date.now()) / 1000) };
  }
  if (!hourly.success) {
    return { limited: true, retryAfter: Math.ceil((hourly.reset - Date.now()) / 1000) };
  }
  if (!daily.success) {
    return { limited: true, retryAfter: Math.ceil((daily.reset - Date.now()) / 1000) };
  }

  return { limited: false };
};
