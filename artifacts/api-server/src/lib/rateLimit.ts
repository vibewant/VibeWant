import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { Redis } from "@upstash/redis";

const useRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
let redis: Redis | null = null;

if (useRedis) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

/* ─── In-memory fallback ────────────────────────────────────────── */
interface RateLimitEntry { count: number; resetAt: number; }
const memStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of memStore.entries()) {
    if (now > e.resetAt) memStore.delete(k);
  }
}, 5 * 60 * 1000);

function memCheck(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

function memRetryAfter(key: string): number {
  const entry = memStore.get(key);
  if (!entry) return 0;
  return Math.ceil((entry.resetAt - Date.now()) / 1000);
}

/* ─── Redis sliding-window check ───────────────────────────────── */
async function redisCheck(key: string, maxRequests: number, windowMs: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const windowSec = Math.ceil(windowMs / 1000);
  const count = await redis!.incr(key);
  if (count === 1) await redis!.expire(key, windowSec);
  if (count > maxRequests) {
    const ttl = await redis!.ttl(key);
    return { allowed: false, retryAfter: Math.max(0, ttl) };
  }
  return { allowed: true, retryAfter: 0 };
}

function getIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.ip
    || req.socket.remoteAddress
    || "unknown";
}

/* ─── Middleware factories ──────────────────────────────────────── */
export function ipRateLimit(maxRequests: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getIp(req);
    const key = `rl:ip:${req.path}:${ip}`;

    if (redis) {
      try {
        const { allowed, retryAfter } = await redisCheck(key, maxRequests, windowMs);
        if (!allowed) {
          res.status(429).json({ error: "rate_limited", message: "Too many requests. Try again later.", retryAfter });
          return;
        }
        next(); return;
      } catch (e) {
        console.error("[RateLimit] Redis error, falling back to memory:", e);
      }
    }

    if (!memCheck(key, maxRequests, windowMs)) {
      res.status(429).json({ error: "rate_limited", message: "Too many requests. Try again later.", retryAfter: memRetryAfter(key) });
      return;
    }
    next();
  };
}

export function agentRateLimit(maxRequests: number, windowMs: number) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const agentId = req.agent?.id;
    if (!agentId) { next(); return; }
    const key = `rl:agent:${req.path}:${agentId}`;

    if (redis) {
      try {
        const { allowed, retryAfter } = await redisCheck(key, maxRequests, windowMs);
        if (!allowed) {
          res.status(429).json({ error: "rate_limited", message: "Too many requests from this agent. Try again later.", retryAfter });
          return;
        }
        next(); return;
      } catch (e) {
        console.error("[RateLimit] Redis error, falling back to memory:", e);
      }
    }

    if (!memCheck(key, maxRequests, windowMs)) {
      res.status(429).json({ error: "rate_limited", message: "Too many requests from this agent. Try again later.", retryAfter: memRetryAfter(key) });
      return;
    }
    next();
  };
}
