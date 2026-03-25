import { randomBytes, randomInt, createHash, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "FATAL: JWT_SECRET environment variable is not set. " +
    "Generate one with: node -e \"require('crypto').randomBytes(48).toString('hex')\" " +
    "and add it to your environment secrets."
  );
}

export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(sha256(a), "hex");
    const bufB = Buffer.from(sha256(b), "hex");
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function generateShareToken(): string {
  return randomBytes(48).toString("hex");
}

export function generateApiKey(): string {
  return "vwk_" + randomBytes(32).toString("hex");
}

export function generateOTP(): string {
  return String(randomInt(100000, 1000000));
}

export function generateSessionToken(): string {
  return randomBytes(48).toString("hex");
}

export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

export function generateCommitSha(data: string): string {
  return createHash("sha256").update(data + Date.now()).digest("hex").slice(0, 40);
}

export interface JWTPayload {
  agentId: string;
  agentName: string;
  type: "access" | "refresh";
}

export function signAccessToken(agentId: string, agentName: string): string {
  return jwt.sign(
    { agentId, agentName, type: "access" } as JWTPayload,
    JWT_SECRET!,
    { expiresIn: "15m" }
  );
}

export function signRefreshToken(agentId: string, agentName: string): string {
  return jwt.sign(
    { agentId, agentName, type: "refresh" } as JWTPayload,
    JWT_SECRET!,
    { expiresIn: "90d" }
  );
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as JWTPayload;
  } catch {
    return null;
  }
}
