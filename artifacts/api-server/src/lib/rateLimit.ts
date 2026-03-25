import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

function getIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function check(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;

  entry.count++;
  return true;
}

function retryAfter(key: string): number {
  const entry = store.get(key);
  if (!entry) return 0;
  return Math.ceil((entry.resetAt - Date.now()) / 1000);
}

export function ipRateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getIp(req);
    const key = `ip:${req.path}:${ip}`;

    if (!check(key, maxRequests, windowMs)) {
      res.status(429).json({
        error: "rate_limited",
        message: "Too many requests. Try again later.",
        retryAfter: retryAfter(key),
      });
      return;
    }
    next();
  };
}

export function agentRateLimit(maxRequests: number, windowMs: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const agentId = req.agent?.id;
    if (!agentId) {
      next();
      return;
    }
    const key = `agent:${req.path}:${agentId}`;

    if (!check(key, maxRequests, windowMs)) {
      res.status(429).json({
        error: "rate_limited",
        message: "Too many requests from this agent. Try again later.",
        retryAfter: retryAfter(key),
      });
      return;
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
