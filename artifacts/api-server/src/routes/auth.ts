import { Router } from "express";
import { db, usersTable, emailCodesTable, userSessionsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { sha256, generateOTP, generateSessionToken } from "../lib/crypto.js";
import { sendVerificationEmail } from "../lib/email.js";
import { ipRateLimit } from "../lib/rateLimit.js";
import { requireUserSession, AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
);

router.post(
  "/auth/send-code",
  ipRateLimit(5, 60 * 60 * 1000),
  async (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "bad_request", message: "Valid email required" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const code = generateOTP();
    const codeHash = sha256(code);
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);

    await db.delete(emailCodesTable).where(eq(emailCodesTable.email, normalizedEmail));
    await db.insert(emailCodesTable).values({ email: normalizedEmail, codeHash, expiresAt });

    try {
      await sendVerificationEmail(normalizedEmail, code);
    } catch (err) {
      console.error("Email send error:", err);
      res.status(500).json({ error: "email_failed", message: "Failed to send verification email" });
      return;
    }

    res.json({ ok: true, message: "Verification code sent" });
  }
);

router.post(
  "/auth/verify",
  ipRateLimit(10, 60 * 60 * 1000),
  async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
      res.status(400).json({ error: "bad_request", message: "Email and code required" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const codeHash = sha256(String(code));
    const now = new Date();

    const [record] = await db
      .select()
      .from(emailCodesTable)
      .where(
        and(
          eq(emailCodesTable.email, normalizedEmail),
          eq(emailCodesTable.codeHash, codeHash),
          eq(emailCodesTable.used, false)
        )
      )
      .limit(1);

    if (!record || record.expiresAt < now) {
      res.status(401).json({ error: "invalid_code", message: "Invalid or expired code" });
      return;
    }

    await db
      .update(emailCodesTable)
      .set({ used: true })
      .where(eq(emailCodesTable.id, record.id));

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    const shouldBeAdmin = ADMIN_EMAILS.has(normalizedEmail);

    if (!user) {
      [user] = await db
        .insert(usersTable)
        .values({ email: normalizedEmail, isAdmin: shouldBeAdmin })
        .returning();
    } else if (shouldBeAdmin && !user.isAdmin) {
      // Promote to admin on next login if they weren't already
      [user] = await db
        .update(usersTable)
        .set({ isAdmin: true })
        .where(eq(usersTable.id, user.id))
        .returning();
    }

    const sessionToken = generateSessionToken();
    const sessionTokenHash = sha256(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.insert(userSessionsTable).values({
      userId: user.id,
      sessionTokenHash,
      expiresAt: sessionExpiresAt,
    });

    res.json({
      ok: true,
      sessionToken,
      user: { id: user.id, email: user.email },
    });
  }
);

router.get("/auth/me", requireUserSession, async (req: AuthenticatedRequest, res) => {
  res.json({ user: { id: req.user!.id, email: req.user!.email, isAdmin: req.user!.isAdmin } });
});

router.post("/auth/logout", requireUserSession, async (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers["authorization"] as string;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const tokenHash = sha256(token);
    await db.delete(userSessionsTable).where(eq(userSessionsTable.sessionTokenHash, tokenHash));
  }
  res.json({ ok: true });
});

export default router;
