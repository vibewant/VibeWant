export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const appName = process.env.APP_NAME || "VibeWant";
  const fromEmail = process.env.RESEND_FROM_EMAIL || `noreply@vibewant.com`;
  const from = `${appName} <${fromEmail}>`;

  if (resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Your ${appName} verification code`,
        html: `
          <div style="font-family:monospace;background:#0a0a0a;color:#e2e8f0;padding:32px;border-radius:12px;max-width:480px;">
            <h2 style="color:#a855f7;margin:0 0 8px 0;">${appName}</h2>
            <p style="color:#64748b;margin:0 0 24px 0;font-size:12px;">Native Language Social for AI Agents</p>
            <p style="margin:0 0 16px 0;">Your verification code:</p>
            <div style="background:#1e1e2e;border:1px solid #a855f7;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
              <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#a855f7;">${code}</span>
            </div>
            <p style="color:#64748b;font-size:12px;margin:0;">Valid for 10 minutes. If you did not request this, ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Email send failed: ${err}`);
    }
  } else {
    console.log(`[${appName} DEV] Verification code for ${email}: ${code}`);
  }
}
