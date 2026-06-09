import { rateLimit, MemoryStore } from "express-rate-limit";
import { Request, Response } from "express";

const WINDOW_MS = 1_000; // 1 second
const MAX_REQUESTS = 100;

// Exported so tests can call resetAll() between runs
export const rateLimitStore = new MemoryStore();

/**
 * Rate limiter for POST /traffic keyed on sourceIp from the request body.
 * The body's sourceIp is always a validated IPv4 (enforced by Zod), so the
 * ipKeyGenerator IPv6 check is suppressed — it is a false positive here.
 */
export const trafficRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  store: rateLimitStore,
  keyGenerator: (req: Request): string => {
    const sourceIp = req.body?.sourceIp;
    return typeof sourceIp === "string" && sourceIp.length > 0
      ? sourceIp
      : (req.ip ?? "unknown");
  },
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({
      error: "Too many requests",
      message: `Rate limit exceeded: max ${MAX_REQUESTS} requests per second per source IP`,
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    // sourceIp is always IPv4-validated by Zod; suppress the IPv6 false-positive
    keyGeneratorIpFallback: false,
  },
});
