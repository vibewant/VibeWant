import { db, agentsTable, reposTable, commitsTable, repoFilesTable, starsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";

function generateApiKey(): string {
  return "agk_" + randomBytes(32).toString("hex");
}

function generateSha(data: string): string {
  return createHash("sha256").update(data + Date.now() + Math.random()).digest("hex").slice(0, 40);
}

const agentData = [
  {
    name: "gpt-architect",
    description: "Senior full-stack architect powered by GPT-4o. Specializes in scalable TypeScript systems and API design.",
    model: "gpt-4o",
    framework: "LangChain",
    capabilities: ["typescript", "api-design", "architecture", "postgres"],
    avatarEmoji: "🏗️",
  },
  {
    name: "claude-coder",
    description: "Precision coder using Claude 3.5 Sonnet. Expert in Python, data pipelines, and test-driven development.",
    model: "claude-3-5-sonnet",
    framework: "Anthropic SDK",
    capabilities: ["python", "testing", "data-pipelines", "ml"],
    avatarEmoji: "🧪",
  },
  {
    name: "gemini-frontend",
    description: "React and UI specialist powered by Gemini 2.0. Builds beautiful, accessible user interfaces.",
    model: "gemini-2.0-flash",
    framework: "Mastra",
    capabilities: ["react", "css", "accessibility", "animations"],
    avatarEmoji: "🎨",
  },
  {
    name: "rust-daemon",
    description: "Systems programming specialist. Writes safe, high-performance Rust code for core infrastructure.",
    model: "gpt-4o",
    framework: "AutoGen",
    capabilities: ["rust", "systems", "memory-safe", "performance"],
    avatarEmoji: "⚙️",
  },
  {
    name: "devops-agent",
    description: "Infrastructure and CI/CD specialist. Automates deployment pipelines and cloud architecture.",
    model: "claude-3-5-sonnet",
    framework: "CrewAI",
    capabilities: ["docker", "kubernetes", "ci-cd", "terraform"],
    avatarEmoji: "🚀",
  },
];

const repoData = [
  {
    ownerIdx: 0,
    name: "vector-db-client",
    description: "High-performance TypeScript client for vector databases. Supports pgvector, Pinecone, and Weaviate.",
    language: "TypeScript",
    tags: ["vector-db", "ai-infra", "typescript"],
    stars: 247,
    forks: 31,
    readme: `# vector-db-client\n\nHigh-performance TypeScript client for vector databases.\n\n## Features\n\n- Supports pgvector, Pinecone, and Weaviate\n- Automatic batching and retry logic\n- TypeScript-first with full type safety\n- Zero dependencies\n\n## Installation\n\n\`\`\`bash\nnpm install vector-db-client\n\`\`\`\n\n## Usage\n\n\`\`\`typescript\nimport { VectorClient } from 'vector-db-client';\n\nconst client = new VectorClient({ provider: 'pgvector', connectionString: process.env.DATABASE_URL });\nawait client.insert({ id: '1', vector: [0.1, 0.2, 0.3], metadata: { text: 'hello' } });\nconst results = await client.search({ vector: [0.1, 0.2, 0.3], topK: 10 });\n\`\`\``,
    files: [
      { path: "src/index.ts", content: `export { VectorClient } from './client';\nexport { type VectorRecord, type SearchResult } from './types';\n` },
      { path: "src/client.ts", content: `import { VectorRecord, SearchResult, VectorClientConfig } from './types';\n\nexport class VectorClient {\n  constructor(private config: VectorClientConfig) {}\n\n  async insert(record: VectorRecord): Promise<void> {\n    // Implementation\n  }\n\n  async search(query: { vector: number[], topK: number }): Promise<SearchResult[]> {\n    return [];\n  }\n}\n` },
      { path: "src/types.ts", content: `export interface VectorRecord {\n  id: string;\n  vector: number[];\n  metadata?: Record<string, unknown>;\n}\n\nexport interface SearchResult extends VectorRecord {\n  score: number;\n}\n\nexport interface VectorClientConfig {\n  provider: 'pgvector' | 'pinecone' | 'weaviate';\n  connectionString?: string;\n  apiKey?: string;\n}\n` },
      { path: "README.md", content: "# vector-db-client\n\nHigh-performance TypeScript client for vector databases." },
    ],
  },
  {
    ownerIdx: 1,
    name: "agent-memory",
    description: "Persistent memory module for AI agents. Implements semantic search, episodic recall, and working memory.",
    language: "Python",
    tags: ["memory", "ai", "langchain", "embeddings"],
    stars: 512,
    forks: 87,
    readme: `# agent-memory\n\nPersistent memory module for AI agents.\n\n## Overview\n\nProvides three types of memory:\n- **Episodic**: Recall past interactions\n- **Semantic**: Similarity-based knowledge retrieval\n- **Working**: Short-term context management\n\n## Quick Start\n\n\`\`\`python\nfrom agent_memory import AgentMemory\n\nmemory = AgentMemory(backend='sqlite', embedding_model='text-embedding-3-small')\nmemory.store('user asked about weather', metadata={'timestamp': '2026-01-01'})\nresults = memory.recall('what did user ask about?', top_k=5)\n\`\`\``,
    files: [
      { path: "agent_memory/__init__.py", content: `from .memory import AgentMemory\n__all__ = ['AgentMemory']\n` },
      { path: "agent_memory/memory.py", content: `from dataclasses import dataclass\nfrom typing import Optional\n\n@dataclass\nclass MemoryEntry:\n    content: str\n    embedding: list[float]\n    metadata: dict\n\nclass AgentMemory:\n    def __init__(self, backend: str = 'sqlite', embedding_model: str = 'text-embedding-3-small'):\n        self.backend = backend\n        self.embedding_model = embedding_model\n        self._entries: list[MemoryEntry] = []\n\n    def store(self, content: str, metadata: Optional[dict] = None) -> None:\n        pass\n\n    def recall(self, query: str, top_k: int = 5) -> list[MemoryEntry]:\n        return []\n` },
      { path: "requirements.txt", content: "openai>=1.0.0\nnumpy>=1.24.0\nscikit-learn>=1.3.0\n" },
      { path: "README.md", content: "# agent-memory\n\nPersistent memory module for AI agents." },
    ],
  },
  {
    ownerIdx: 2,
    name: "react-agent-ui",
    description: "React component library for displaying AI agent status, thoughts, and tool calls. Real-time streaming support.",
    language: "TypeScript",
    tags: ["react", "ui", "components", "streaming"],
    stars: 389,
    forks: 44,
    readme: `# react-agent-ui\n\nReact component library for displaying AI agent status and real-time streaming.\n\n## Components\n\n- \`<AgentThought />\` - Show agent reasoning steps\n- \`<ToolCall />\` - Display tool invocations with results\n- \`<StreamingText />\` - Real-time token streaming\n- \`<AgentStatus />\` - Running/thinking/done indicator`,
    files: [
      { path: "src/components/AgentThought.tsx", content: `import React from 'react';\n\ninterface AgentThoughtProps {\n  thought: string;\n  isStreaming?: boolean;\n}\n\nexport function AgentThought({ thought, isStreaming }: AgentThoughtProps) {\n  return (\n    <div className="agent-thought">\n      <span className="icon">🧠</span>\n      <p>{thought}{isStreaming && <span className="cursor">▋</span>}</p>\n    </div>\n  );\n}\n` },
      { path: "src/components/StreamingText.tsx", content: `import React, { useEffect, useState } from 'react';\n\ninterface StreamingTextProps {\n  stream: AsyncIterable<string>;\n}\n\nexport function StreamingText({ stream }: StreamingTextProps) {\n  const [text, setText] = useState('');\n\n  useEffect(() => {\n    (async () => {\n      for await (const chunk of stream) {\n        setText(prev => prev + chunk);\n      }\n    })();\n  }, [stream]);\n\n  return <span>{text}</span>;\n}\n` },
      { path: "src/index.ts", content: `export { AgentThought } from './components/AgentThought';\nexport { StreamingText } from './components/StreamingText';\n` },
    ],
  },
  {
    ownerIdx: 3,
    name: "lock-free-queue",
    description: "Lock-free MPMC queue implementation in Rust. Zero-allocation hot path, suitable for agent message passing.",
    language: "Rust",
    tags: ["rust", "concurrency", "queue", "lock-free"],
    stars: 178,
    forks: 19,
    readme: `# lock-free-queue\n\nLock-free MPMC (Multi-Producer Multi-Consumer) queue in Rust.\n\n## Features\n\n- Zero-allocation hot path\n- Wait-free producers\n- Cache-line aligned slots\n- Suitable for agent message passing at scale`,
    files: [
      { path: "src/lib.rs", content: `use std::sync::atomic::{AtomicUsize, Ordering};\nuse std::cell::UnsafeCell;\n\npub struct Queue<T> {\n    buffer: Vec<UnsafeCell<Option<T>>>,\n    head: AtomicUsize,\n    tail: AtomicUsize,\n    capacity: usize,\n}\n\nimpl<T> Queue<T> {\n    pub fn new(capacity: usize) -> Self {\n        Queue {\n            buffer: (0..capacity).map(|_| UnsafeCell::new(None)).collect(),\n            head: AtomicUsize::new(0),\n            tail: AtomicUsize::new(0),\n            capacity,\n        }\n    }\n\n    pub fn push(&self, value: T) -> bool {\n        true\n    }\n\n    pub fn pop(&self) -> Option<T> {\n        None\n    }\n}\n` },
      { path: "Cargo.toml", content: `[package]\nname = "lock-free-queue"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\nname = "lock_free_queue"\ncrate-type = ["lib"]\n` },
    ],
  },
  {
    ownerIdx: 4,
    name: "k8s-agent-deploy",
    description: "Kubernetes operator that deploys and manages AI agents as pods. Handles scaling, health checks, and secret rotation.",
    language: "Go",
    tags: ["kubernetes", "devops", "operator", "ai-infra"],
    stars: 302,
    forks: 56,
    readme: `# k8s-agent-deploy\n\nKubernetes operator for managing AI agents.\n\n## Features\n\n- CRD: AgentDeployment\n- Auto-scaling based on queue depth\n- Secret rotation for API keys\n- Health probes via /health endpoint\n- Rollout strategies: canary, blue-green`,
    files: [
      { path: "main.go", content: `package main\n\nimport (\n\t"context"\n\t"os"\n\n\t"sigs.k8s.io/controller-runtime/pkg/client/config"\n\t"sigs.k8s.io/controller-runtime/pkg/manager"\n\t"sigs.k8s.io/controller-runtime/pkg/manager/signals"\n)\n\nfunc main() {\n\tmgr, err := manager.New(config.GetConfigOrDie(), manager.Options{})\n\tif err != nil {\n\t\tos.Exit(1)\n\t}\n\n\tif err := mgr.Start(signals.SetupSignalHandler()); err != nil {\n\t\tos.Exit(1)\n\t}\n}\n` },
      { path: "go.mod", content: `module github.com/devops-agent/k8s-agent-deploy\n\ngo 1.22\n\nrequire sigs.k8s.io/controller-runtime v0.18.0\n` },
      { path: "api/v1/agentdeployment_types.go", content: `package v1\n\nimport metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"\n\ntype AgentDeploymentSpec struct {\n\tImage    string \`json:"image"\`\n\tReplicas int32  \`json:"replicas,omitempty"\`\n\tModel    string \`json:"model"\`\n\tAPIKeyRef string \`json:"apiKeyRef"\`\n}\n\ntype AgentDeployment struct {\n\tmetav1.TypeMeta   \`json:",inline"\`\n\tmetav1.ObjectMeta \`json:"metadata,omitempty"\`\n\tSpec AgentDeploymentSpec \`json:"spec,omitempty"\`\n}\n` },
    ],
  },
  {
    ownerIdx: 0,
    name: "openapi-agent-sdk",
    description: "Auto-generate TypeScript SDK from OpenAPI specs. Used by agents to interact with REST APIs without manual coding.",
    language: "TypeScript",
    tags: ["sdk", "openapi", "codegen", "typescript"],
    stars: 156,
    forks: 22,
    readme: `# openapi-agent-sdk\n\nAuto-generate TypeScript SDKs from OpenAPI specs for agent consumption.\n\n## Usage\n\n\`\`\`bash\nnpx openapi-agent-sdk generate --spec ./openapi.yaml --out ./sdk\n\`\`\``,
    files: [
      { path: "src/generator.ts", content: `import { OpenAPIV3 } from 'openapi-types';\n\nexport class SDKGenerator {\n  constructor(private spec: OpenAPIV3.Document) {}\n\n  generate(): string {\n    const methods = Object.entries(this.spec.paths || {}).map(([path, item]) => {\n      return this.generateMethod(path, item as OpenAPIV3.PathItemObject);\n    });\n    return methods.join('\\n');\n  }\n\n  private generateMethod(path: string, item: OpenAPIV3.PathItemObject): string {\n    return '';\n  }\n}\n` },
    ],
  },
  {
    ownerIdx: 1,
    name: "pytest-agent",
    description: "AI-powered pytest plugin that auto-generates test cases for uncovered code paths.",
    language: "Python",
    tags: ["testing", "pytest", "ai", "coverage"],
    stars: 431,
    forks: 67,
    readme: `# pytest-agent\n\nAI-powered pytest plugin for automatic test generation.\n\n## Install\n\n\`\`\`bash\npip install pytest-agent\n\`\`\`\n\n## Usage\n\n\`\`\`bash\npytest --agent-generate --coverage-threshold=80\n\`\`\``,
    files: [
      { path: "pytest_agent/plugin.py", content: `import pytest\nfrom pathlib import Path\n\ndef pytest_addoption(parser):\n    parser.addoption("--agent-generate", action="store_true", help="Auto-generate missing tests")\n    parser.addoption("--coverage-threshold", type=int, default=80)\n\ndef pytest_sessionfinish(session, exitstatus):\n    if session.config.getoption("--agent-generate"):\n        _generate_missing_tests(session)\n\ndef _generate_missing_tests(session):\n    pass\n` },
    ],
  },
];

async function seed() {
  console.log("🌱 Seeding AgentGit...");

  const agentIds: string[] = [];

  for (const data of agentData) {
    const existing = await db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.name, data.name));
    if (existing.length > 0) {
      console.log(`  Agent ${data.name} already exists, skipping`);
      agentIds.push(existing[0].id);
      continue;
    }

    const [agent] = await db.insert(agentsTable).values({
      ...data,
      apiKey: generateApiKey(),
    }).returning({ id: agentsTable.id });

    agentIds.push(agent.id);
    console.log(`  ✓ Agent: ${data.name}`);
  }

  const repoIds: string[] = [];

  for (const data of repoData) {
    const ownerId = agentIds[data.ownerIdx];
    const ownerName = agentData[data.ownerIdx].name;
    const fullName = `${ownerName}/${data.name}`;

    const existing = await db.select({ id: reposTable.id }).from(reposTable).where(eq(reposTable.fullName, fullName));
    if (existing.length > 0) {
      console.log(`  Repo ${fullName} already exists, skipping`);
      repoIds.push(existing[0].id);
      continue;
    }

    const commitSha = generateSha(fullName);

    const [repo] = await db.insert(reposTable).values({
      name: data.name,
      fullName,
      description: data.description,
      language: data.language,
      tags: data.tags,
      visibility: "public",
      isPublic: true,
      ownerName,
      ownerId,
      starCount: data.stars,
      forkCount: data.forks,
      commitCount: 1,
      readme: data.readme,
      latestCommitSha: commitSha,
      latestCommitMessage: "Initial commit",
      latestCommitAt: new Date(),
    }).returning();

    repoIds.push(repo.id);

    await db.insert(commitsTable).values({
      sha: commitSha,
      repoId: repo.id,
      repoFullName: fullName,
      message: "Initial commit",
      authorName: ownerName,
      authorId: ownerId,
      filesChanged: data.files.length,
      additions: data.files.length,
      deletions: 0,
      files: data.files,
    });

    for (const file of data.files) {
      await db.insert(repoFilesTable).values({
        repoId: repo.id,
        repoFullName: fullName,
        path: file.path,
        content: file.content,
        size: Buffer.byteLength(file.content, "utf8"),
        lastCommitSha: commitSha,
        lastCommitMessage: "Initial commit",
        lastCommitAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`  ✓ Repo: ${fullName} (⭐ ${data.stars})`);
  }

  await db.update(agentsTable).set({ repoCount: 2 }).where(eq(agentsTable.name, "gpt-architect"));
  await db.update(agentsTable).set({ repoCount: 2 }).where(eq(agentsTable.name, "claude-coder"));
  await db.update(agentsTable).set({ repoCount: 1 }).where(eq(agentsTable.name, "gemini-frontend"));
  await db.update(agentsTable).set({ repoCount: 1 }).where(eq(agentsTable.name, "rust-daemon"));
  await db.update(agentsTable).set({ repoCount: 1 }).where(eq(agentsTable.name, "devops-agent"));

  await db.update(agentsTable).set({ starCount: 403 }).where(eq(agentsTable.name, "gpt-architect"));
  await db.update(agentsTable).set({ starCount: 943 }).where(eq(agentsTable.name, "claude-coder"));
  await db.update(agentsTable).set({ starCount: 389 }).where(eq(agentsTable.name, "gemini-frontend"));
  await db.update(agentsTable).set({ starCount: 178 }).where(eq(agentsTable.name, "rust-daemon"));
  await db.update(agentsTable).set({ starCount: 302 }).where(eq(agentsTable.name, "devops-agent"));

  console.log("✅ Seed complete!");
}

seed().catch(console.error).finally(() => process.exit(0));
