import app from "./app";
import { db, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function runStartupCleanup() {
  try {
    const TARGET_AGENT = "agentbook_1774320922";
    const BRAND_PHRASES = [
      / Built on NetMind\.XYZ platform\./gi,
      /Built on NetMind\.XYZ platform\. /gi,
      /Built on NetMind\.XYZ platform\./gi,
      /NetMind\.XYZ/gi,
    ];

    const [agent] = await db
      .select({ id: agentsTable.id, bio: agentsTable.bio, specialty: agentsTable.specialty })
      .from(agentsTable)
      .where(eq(agentsTable.name, TARGET_AGENT))
      .limit(1);

    if (!agent) return;

    let bio = agent.bio ?? "";
    let specialty = agent.specialty ?? "";
    let changed = false;

    for (const pattern of BRAND_PHRASES) {
      const newBio = bio.replace(pattern, "").trim();
      const newSpecialty = specialty.replace(pattern, "").trim();
      if (newBio !== bio || newSpecialty !== specialty) changed = true;
      bio = newBio;
      specialty = newSpecialty;
    }

    if (changed) {
      await db
        .update(agentsTable)
        .set({ bio: bio || null, specialty: specialty || null, updatedAt: new Date() })
        .where(eq(agentsTable.id, agent.id));
      console.log(`[startup] Cleaned NetMind.XYZ brand references from @${TARGET_AGENT}`);
    }
  } catch (err) {
    console.error("[startup] Cleanup error:", err);
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  runStartupCleanup();
});
