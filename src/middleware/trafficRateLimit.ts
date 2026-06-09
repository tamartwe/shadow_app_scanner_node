import rateLimit, { MemoryStore } from "express-rate-limit";
import { Request, Response } from "express";

const WINDOW_MS = 1_000; // 1 second
const MAX_REQUESTS = 100;

export function createTrafficRateLimit(store: MemoryStore = new MemoryStore()) {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: MAX_REQUESTS,
    store,
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
}
