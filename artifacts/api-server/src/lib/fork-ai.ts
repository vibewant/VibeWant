import { anthropic } from "@workspace/integrations-anthropic-ai";

function getClient() {
  return anthropic;
}

export interface CodeFile {
  path: string;
  content: string;
}

export interface AIForkResult {
  files: CodeFile[];
  commitMessage: string;
  summary: string;
  aiModified: boolean;
}

function detectIsCode(comment: string): boolean {
  const codePatterns = [
    /^(import|from|def |class |function |const |let |var |#include|package |using )/m,
    /[{};]\s*$/m,
    /^\s{2,}(return|if|for|while|async|await)\b/m,
    /`{3}/,
  ];
  return codePatterns.some(p => p.test(comment));
}

export async function applyCommentToRepo(
  originalFiles: CodeFile[],
  comment: string,
  repoFullName: string,
  language: string | null,
): Promise<AIForkResult> {
  const isCodeComment = detectIsCode(comment);

  // Include more content per file for richer context
  const filesSummary = originalFiles
    .slice(0, 10)
    .map(f => {
      const lines = f.content.split("\n");
      const preview = lines.slice(0, 120).join("\n");
      return `### ${f.path}\n\`\`\`${language ?? ""}\n${preview}\n\`\`\``;
    })
    .join("\n\n");

  const systemPrompt = isCodeComment
    ? `You are an expert software engineer performing a code-level fork-merge.
You will receive source files from an existing repository and a code snippet the forker wrote.
Your job: organically integrate the snippet into the existing codebase and return valid JSON.

RULES:
1. Return ONLY a valid JSON object — no markdown, no code fences, no explanation outside JSON.
2. Only include files that were actually modified or newly created.
3. Integrate the snippet into the most appropriate existing file(s), preserving original logic.
4. If the snippet adds new functionality, wire it up properly (imports, exports, calls).
5. Keep the same language, style, and conventions as the original.
6. The resulting code must be syntactically valid and immediately runnable.

OUTPUT FORMAT (strict JSON):
{
  "summary": "One sentence describing the fusion",
  "commitMessage": "feat: <short description> (max 72 chars)",
  "files": [{ "path": "filename.ext", "content": "full file content", "action": "modified" }]
}`
    : `You are an expert software engineer performing an AI-powered fork-fusion.
You will receive source files from an existing repository and a natural-language feature request from the forker.
Your job: implement the requested feature by extending and organically fusing new code with the existing codebase.

RULES:
1. Return ONLY a valid JSON object — no markdown, no code fences, no explanation outside JSON.
2. Only include files that were actually modified or newly created.
3. Deeply understand the intent of the natural-language request.
4. Implement it as new functionality that integrates seamlessly with the existing code structure.
5. The new feature should genuinely extend the original — not just append unrelated code.
6. Wire everything up: if you add a new function, call it; if you add a new class, use it; update any entry points.
7. Keep the same language, style, and conventions as the original.
8. The resulting code must be syntactically valid and immediately runnable — the user will click Run.
9. Think step-by-step: what does the request mean? what files need changing? how do they connect?

OUTPUT FORMAT (strict JSON):
{
  "summary": "One sentence describing the new feature added",
  "commitMessage": "feat: <short description> (max 72 chars)",
  "files": [{ "path": "filename.ext", "content": "full file content", "action": "modified" }]
}`;

  const userPrompt = isCodeComment
    ? `Repository: ${repoFullName}
Language: ${language ?? "unknown"}

CODE SNIPPET TO INTEGRATE:
\`\`\`
${comment}
\`\`\`

EXISTING SOURCE FILES:
${filesSummary}

Integrate the code snippet organically into the existing codebase. Return JSON only.`
    : `Repository: ${repoFullName}
Language: ${language ?? "unknown"}

FEATURE REQUEST (natural language from forker):
"${comment}"

EXISTING SOURCE FILES:
${filesSummary}

Implement this feature by organically fusing new code with the existing codebase.
The result must be a fully working, runnable program with the new feature built in.
Return JSON only.`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonText = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as {
      summary: string;
      commitMessage: string;
      files: { path: string; content: string; action: string }[];
    };

    if (!parsed.files || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      throw new Error("AI returned no file changes");
    }

    const modifiedPaths = new Set(parsed.files.map(f => f.path));
    const unchangedFiles = originalFiles
      .filter(f => !modifiedPaths.has(f.path))
      .map(f => ({ path: f.path, content: f.content }));

    return {
      files: [
        ...unchangedFiles,
        ...parsed.files.map(f => ({ path: f.path, content: f.content })),
      ],
      commitMessage: (parsed.commitMessage ?? `AI fork: ${comment.slice(0, 60)}`).slice(0, 120),
      summary: parsed.summary ?? comment.slice(0, 200),
      aiModified: true,
    };
  } catch (err) {
    console.error("[fork-ai] AI modification failed, falling back to original files:", err);
    return {
      files: [
        ...originalFiles,
        {
          path: "FORK_NOTES.md",
          content: `# Fork Notes\n\n${comment}\n\n---\n*Forked from [${repoFullName}](/${repoFullName})*\n`,
        },
      ],
      commitMessage: `Fork of ${repoFullName}: ${comment.slice(0, 60)}`,
      summary: comment.slice(0, 200),
      aiModified: false,
    };
  }
}
