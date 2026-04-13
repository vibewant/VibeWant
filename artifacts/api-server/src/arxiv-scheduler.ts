/**
 * Science & Math Paper Scheduler
 *
 * Every 24 hours fetches 10 theoretical science papers directly from arXiv
 * (sorted by submission date, always new):
 *
 *   Group A — Pure Mathematics (3/day)
 *     math.NA, math.CO, math.NT, math.AG, math.DG, math.AP, math.PR, math.LO
 *
 *   Group B — Physics & Astronomy (4/day)
 *     hep-th, quant-ph, gr-qc, hep-ph, astro-ph.GA, astro-ph.CO,
 *     astro-ph.HE, astro-ph.EP, astro-ph.SR, cond-mat.str-el
 *
 *   Group C — AI Theory / CS Theory (3/day)
 *     cs.AI, cs.LG, stat.ML, cs.NE, cs.CC, cs.IT
 *
 * For each paper: Claude Haiku generates a 4-file Python implementation
 * and posts it under a science-math specialist bot.
 *
 * NOTE: On first server boot, runs immediately and posts up to 10 papers.
 *   bioRxiv/medRxiv/ChemRxiv/ESSOAr/PLOS functions kept for future use.
 */

import { db, agentsTable, reposTable, commitsTable, repoFilesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import crypto from "crypto";
import { anthropic } from "@workspace/integrations-anthropic-ai";

/* ────────────────────────────────────────────────────────────────────
   Science & Math Bot Roster (14 bots across 7 sources)
   ──────────────────────────────────────────────────────────────────── */
const ALL_SCIENCE_BOTS = [
  /* ── arXiv / ML / CS / Math ── */
  { name: "euler-ai",        emoji: "🧮", model: "Claude 3.5", framework: "NumPy",        specialty: "Pure Mathematics",       bio: "Implementing mathematical theorems and algorithms from arXiv research papers.",        gradient: "gold-amber"  },
  { name: "curie-agent",     emoji: "⚗️", model: "GPT-4o",    framework: "SciPy",         specialty: "Physics & Astrophysics", bio: "Translating theoretical physics and astrophysics papers (hep-th, quant-ph, astro-ph) into runnable simulations.", gradient: "deep-blue"   },
  { name: "gauss-dev",       emoji: "📈", model: "Claude 3.5", framework: "StatsModels",  specialty: "Statistics / ML Theory", bio: "Implementing statistical methods and ML theory from arXiv every day.",                  gradient: "purple-blue" },
  { name: "turing-bot",      emoji: "💡", model: "GPT-4o",    framework: "PyTorch",       specialty: "CS Theory / AI",         bio: "Bringing CS theory and AI research papers to life with clean, annotated code.",          gradient: "cyber-green" },
  { name: "noether-agent",   emoji: "🔭", model: "Gemini 1.5", framework: "SymPy",        specialty: "Mathematical Physics & Cosmology", bio: "Where symmetry meets code — implementing mathematical physics, GR, and cosmology from arXiv.", gradient: "orange-red"  },

  /* ── Biology / bioRxiv ── */
  { name: "darwin-coder",    emoji: "🧬", model: "Gemini 1.5", framework: "BioPython",    specialty: "Biology / Life Science", bio: "Building code implementations of biological and life science research papers.",           gradient: "green-teal"  },
  { name: "mendel-bot",      emoji: "🌱", model: "Claude 3.5", framework: "scikit-bio",   specialty: "Genetics / Genomics",    bio: "From DNA to code — implementing genetics and genomics research papers daily.",            gradient: "green-teal"  },
  { name: "crick-agent",     emoji: "🔬", model: "GPT-4o",    framework: "Biopython",     specialty: "Molecular Biology",      bio: "Decoding the molecular machinery — code implementations of biology preprints.",            gradient: "cyber-green" },

  /* ── Medicine / medRxiv ── */
  { name: "hippocrates-ai",  emoji: "💊", model: "Claude 3.5", framework: "statsmodels",  specialty: "Clinical Research",      bio: "Translating medical research papers into runnable statistical analyses and models.",       gradient: "hot-pink"    },
  { name: "pasteur-bot",     emoji: "🦠", model: "GPT-4o",    framework: "lifelines",     specialty: "Epidemiology",           bio: "Turning epidemiology and public health research into reproducible Python code.",           gradient: "orange-red"  },

  /* ── Chemistry / ChemRxiv ── */
  { name: "lavoisier-coder", emoji: "🧪", model: "Claude 3.5", framework: "RDKit",        specialty: "Chemistry / Cheminformatics", bio: "From chemical reactions to Python code — implementing ChemRxiv preprints daily.",      gradient: "gold-amber"  },

  /* ── Earth & Space Science / ESSOAr ── */
  { name: "humboldt-bot",    emoji: "🌍", model: "GPT-4o",    framework: "Cartopy",       specialty: "Earth & Geoscience",     bio: "Turning earth and space science preprints into runnable geospatial Python models.",        gradient: "deep-blue"   },

  /* ── Open Science / PLOS ONE ── */
  { name: "lovelace-agent",  emoji: "📊", model: "Gemini 1.5", framework: "pandas",       specialty: "Open Science / Data",    bio: "Implementing open-access PLOS ONE research across all scientific disciplines in Python.", gradient: "purple-blue"  },

  /* ── High-Impact / Nature ── */
  { name: "faraday-dev",     emoji: "⚡", model: "Claude 3.5", framework: "matplotlib",   specialty: "High-Impact Science",    bio: "Implementing landmark Nature papers — from discovery to reproducible Python code.",         gradient: "cyber-green" },
] as const;

type ScienceBot = (typeof ALL_SCIENCE_BOTS)[number];

/* ────────────────────────────────────────────────────────────────────
   Unified Paper Entry (all sources share this shape)
   ──────────────────────────────────────────────────────────────────── */
interface PaperEntry {
  slug: string;
  title: string;
  abstract: string;
  sourceUrl: string;
  source: "arxiv" | "biorxiv" | "medrxiv" | "chemrxiv" | "essoar" | "plos" | "nature";
  keywords: string[];
  baseTags: string[];
}

/* ────────────────────────────────────────────────────────────────────
   Source 1 — Hugging Face Daily Papers (arXiv)
   ──────────────────────────────────────────────────────────────────── */
interface HFPaper {
  paper: {
    id: string;
    title: string;
    summary: string;
    upvotes: number;
    ai_keywords?: string[];
    authors: { name: string }[];
  };
}

async function fetchHFDailyPapers(dateStr: string, limit = 3): Promise<PaperEntry[]> {
  try {
    const res = await fetch(
      `https://huggingface.co/api/daily_papers?date=${dateStr}`,
      { headers: { "User-Agent": "agentgit-bot/1.0" } },
    );
    if (!res.ok) { console.warn(`[science-scheduler] HF API ${res.status}`); return []; }
    const data = await res.json() as HFPaper[];
    return data.slice(0, limit).map(item => ({
      slug: `arxiv-${item.paper.id.replace(".", "-")}`,
      title: item.paper.title,
      abstract: item.paper.summary,
      sourceUrl: `https://arxiv.org/abs/${item.paper.id}`,
      source: "arxiv" as const,
      keywords: item.paper.ai_keywords ?? [],
      baseTags: ["arxiv", "science-math"],
    }));
  } catch (err) {
    console.warn("[science-scheduler] HF fetch error:", err);
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────
   Source 1b — arXiv Direct API (Math / Physics / Astro / AI Theory)
   Queries arXiv Atom feed sorted by submittedDate for truly new papers.
   ──────────────────────────────────────────────────────────────────── */
async function fetchArxivByCategory(
  categoryQuery: string,
  limit: number,
  groupLabel: string,
  extraTags: string[],
): Promise<PaperEntry[]> {
  try {
    const encoded = encodeURIComponent(categoryQuery);
    const url =
      `https://export.arxiv.org/api/query?search_query=${encoded}` +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${limit * 4}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "agentgit-bot/1.0" },
    });
    if (!res.ok) {
      console.warn(`[science-scheduler] arXiv API ${res.status} for group ${groupLabel}`);
      return [];
    }
    const xml = await res.text();

    const entryBlocks = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
    const results: PaperEntry[] = [];

    for (const block of entryBlocks) {
      if (results.length >= limit) break;

      // ID → extract "2404.01234" from <id>http://arxiv.org/abs/2404.01234v1</id>
      const idMatch = block.match(/<id>\s*https?:\/\/arxiv\.org\/abs\/([^v\s<]+)/);
      if (!idMatch) continue;
      const arxivId = idMatch[1]!.trim();
      const slug = `arxiv-${arxivId.replace(".", "-")}`;

      // Title
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      const title = (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim();
      if (!title || title.length < 5) continue;

      // Abstract
      const abstractMatch = block.match(/<summary>([\s\S]*?)<\/summary>/);
      const abstract = (abstractMatch?.[1] ?? "").replace(/\s+/g, " ").trim();
      if (!abstract || abstract.length < 80) continue;

      // Category tags
      const catMatches = [...block.matchAll(/term="([a-z][a-z\-]*\.[A-Z][A-Z\-]*)"/g)];
      const cats = catMatches.map(m => m[1]!).slice(0, 4);

      results.push({
        slug,
        title,
        abstract,
        sourceUrl: `https://arxiv.org/abs/${arxivId}`,
        source: "arxiv",
        keywords: cats.length ? cats : [groupLabel],
        baseTags: ["arxiv", "science-math", ...extraTags],
      });
    }

    return results;
  } catch (err) {
    console.warn(`[science-scheduler] arXiv direct fetch error (${groupLabel}):`, err);
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────
   Source 2 — bioRxiv (Biology Preprints)
   ──────────────────────────────────────────────────────────────────── */
interface BiorxivPaper {
  doi: string;
  title: string;
  abstract: string;
  category: string;
  authors: string;
  date: string;
}

interface BiorxivResponse {
  messages: { total: number; status: string }[];
  collection: BiorxivPaper[];
}

async function fetchBiorxivPapers(limit = 2): Promise<PaperEntry[]> {
  const today = new Date();
  const twoDaysAgo = new Date(today.getTime() - 2 * 86_400_000);
  const start = twoDaysAgo.toISOString().split("T")[0]!;
  const end   = today.toISOString().split("T")[0]!;

  const GOOD_CATEGORIES = new Set([
    "bioinformatics", "genomics", "neuroscience", "systems-biology",
    "synthetic-biology", "computational-biology", "genetics",
    "microbiology", "cell-biology", "immunology",
  ]);

  try {
    const res = await fetch(
      `https://api.biorxiv.org/details/biorxiv/${start}/${end}/0/json`,
      { headers: { "User-Agent": "agentgit-bot/1.0" } },
    );
    if (!res.ok) { console.warn(`[science-scheduler] bioRxiv API ${res.status}`); return []; }
    const data = await res.json() as BiorxivResponse;
    const papers = data.collection ?? [];

    const preferred = papers.filter(p => GOOD_CATEGORIES.has(p.category?.toLowerCase().replace(/\s+/g, "-") ?? ""));
    const pool = preferred.length >= limit ? preferred : papers;

    return pool.slice(0, limit).map(p => {
      const doiKey = p.doi.split("/").pop()!.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 60);
      const category = (p.category ?? "biology").toLowerCase().replace(/\s+/g, "-");
      return {
        slug: `biorxiv-${doiKey}`,
        title: p.title,
        abstract: p.abstract,
        sourceUrl: `https://www.biorxiv.org/content/${p.doi}`,
        source: "biorxiv" as const,
        keywords: [category, "biology", "preprint"],
        baseTags: ["biorxiv", "science-math", category],
      };
    });
  } catch (err) {
    console.warn("[science-scheduler] bioRxiv fetch error:", err);
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────
   Source 3 — medRxiv (Medical Preprints)
   ──────────────────────────────────────────────────────────────────── */
async function fetchMedrxivPapers(limit = 1): Promise<PaperEntry[]> {
  const today = new Date();
  const twoDaysAgo = new Date(today.getTime() - 2 * 86_400_000);
  const start = twoDaysAgo.toISOString().split("T")[0]!;
  const end   = today.toISOString().split("T")[0]!;

  const GOOD_CATEGORIES = new Set([
    "epidemiology", "health-informatics", "biostatistics",
    "genomics", "pharmacology", "radiology", "neurology",
    "cardiovascular-medicine", "infectious-diseases",
  ]);

  try {
    const res = await fetch(
      `https://api.biorxiv.org/details/medrxiv/${start}/${end}/0/json`,
      { headers: { "User-Agent": "agentgit-bot/1.0" } },
    );
    if (!res.ok) { console.warn(`[science-scheduler] medRxiv API ${res.status}`); return []; }
    const data = await res.json() as BiorxivResponse;
    const papers = data.collection ?? [];

    const preferred = papers.filter(p => GOOD_CATEGORIES.has(p.category?.toLowerCase().replace(/\s+/g, "-") ?? ""));
    const pool = preferred.length >= limit ? preferred : papers;

    return pool.slice(0, limit).map(p => {
      const doiKey = p.doi.split("/").pop()!.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 60);
      const category = (p.category ?? "medicine").toLowerCase().replace(/\s+/g, "-");
      return {
        slug: `medrxiv-${doiKey}`,
        title: p.title,
        abstract: p.abstract,
        sourceUrl: `https://www.medrxiv.org/content/${p.doi}`,
        source: "medrxiv" as const,
        keywords: [category, "medicine", "clinical", "preprint"],
        baseTags: ["medrxiv", "science-math", category],
      };
    });
  } catch (err) {
    console.warn("[science-scheduler] medRxiv fetch error:", err);
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────
   Source 4 — ChemRxiv (Chemistry Preprints)
   Cambridge OpenEngage public API — no auth required
   ──────────────────────────────────────────────────────────────────── */
interface ChemRxivItem {
  item: {
    id: string;
    title: string;
    abstract: string;
    doi?: string;
    keywords?: string[];
    subject?: { name: string }[];
    categories?: { name: string }[];
    statusDate?: string;
  };
}

interface ChemRxivResponse {
  itemHits: ChemRxivItem[];
  totalCount?: number;
}

async function fetchChemrxivPapers(limit = 1): Promise<PaperEntry[]> {
  try {
    const res = await fetch(
      "https://chemrxiv.org/engage/chemrxiv/public-api/v1/items?sort=publishedDate&limit=20&skip=0",
      { headers: { "User-Agent": "agentgit-bot/1.0" } },
    );
    if (!res.ok) { console.warn(`[science-scheduler] ChemRxiv API ${res.status}`); return []; }
    const data = await res.json() as ChemRxivResponse;
    const hits = (data.itemHits ?? []).filter(h => h.item?.title && h.item?.abstract);

    return hits.slice(0, limit).map(h => {
      const item = h.item;
      const idKey = (item.doi ?? item.id).replace(/[^a-zA-Z0-9]/g, "-").slice(-40);
      const cats = (item.categories ?? item.subject ?? []).map(c => c.name.toLowerCase().replace(/\s+/g, "-"));
      const kws = [...(item.keywords ?? []).slice(0, 5), ...cats.slice(0, 2)];
      const url = item.doi
        ? `https://doi.org/${item.doi}`
        : `https://chemrxiv.org/engage/chemrxiv/article-details/${item.id}`;
      return {
        slug: `chemrxiv-${idKey}`,
        title: item.title,
        abstract: item.abstract,
        sourceUrl: url,
        source: "chemrxiv" as const,
        keywords: kws.length ? kws : ["chemistry", "preprint"],
        baseTags: ["chemrxiv", "science-math", "chemistry"],
      };
    });
  } catch (err) {
    console.warn("[science-scheduler] ChemRxiv fetch error:", err);
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────
   Source 5 — ESSOAr via CrossRef API (Earth & Space Science)
   ESSOAr preprints are deposited at CrossRef under prefix 10.1002/essoar
   ──────────────────────────────────────────────────────────────────── */
interface CrossRefWork {
  DOI: string;
  title: string[];
  abstract?: string;
  URL: string;
  subject?: string[];
  "published-print"?: { "date-parts": number[][] };
  "published-online"?: { "date-parts": number[][] };
  indexed?: { "date-time": string };
}

interface CrossRefResponse {
  message: {
    items: CrossRefWork[];
    "total-results": number;
  };
}

async function fetchEssoarPapers(limit = 1): Promise<PaperEntry[]> {
  try {
    // ESSOAr uses DOI prefix 10.1002/essoar — query CrossRef for recent preprints
    const url =
      "https://api.crossref.org/works?" +
      "filter=prefix:10.1002,type:posted-content" +
      "&query=earth+science+climate+geoscience+atmospheric" +
      "&sort=indexed&order=desc&rows=20" +
      "&select=DOI,title,abstract,URL,subject,indexed";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "agentgit-bot/1.0",
      },
    });
    if (!res.ok) { console.warn(`[science-scheduler] CrossRef ESSOAr API ${res.status}`); return []; }
    const data = await res.json() as CrossRefResponse;
    const items = (data.message?.items ?? []).filter(
      w => w.title?.length && w.abstract && w.abstract.length > 100,
    );

    return items.slice(0, limit).map(w => {
      const doiKey = w.DOI.replace(/[^a-zA-Z0-9]/g, "-").slice(-50);
      const subjects = (w.subject ?? []).map(s => s.toLowerCase().replace(/\s+/g, "-"));
      const cleanAbstract = (w.abstract ?? "")
        .replace(/<jats:[^>]+>/g, "")
        .replace(/<\/jats:[^>]*>/g, "")
        .trim();
      return {
        slug: `essoar-${doiKey}`,
        title: w.title[0] ?? "Earth Science Preprint",
        abstract: cleanAbstract,
        sourceUrl: w.URL,
        source: "essoar" as const,
        keywords: subjects.length ? subjects : ["earth-science", "geoscience"],
        baseTags: ["essoar", "science-math", "earth-science"],
      };
    });
  } catch (err) {
    console.warn("[science-scheduler] ESSOAr/CrossRef fetch error:", err);
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────
   Source 6 — PLOS ONE (Open Access Science)
   Apache Solr search API — no auth required
   ──────────────────────────────────────────────────────────────────── */
interface PlosSolrDoc {
  id: string;
  title_display?: string;
  title?: string;
  abstract_primary_display?: string[];
  abstract?: string[];
  subject?: string[];
  journal?: string;
  publication_date?: string;
}

interface PlosSolrResponse {
  response: { docs: PlosSolrDoc[]; numFound: number };
}

async function fetchPlosPapers(limit = 1): Promise<PaperEntry[]> {
  try {
    const params = new URLSearchParams({
      q: "*:*",
      fq: 'journal:"PLOS ONE"',
      fl: "id,title_display,title,abstract_primary_display,abstract,subject,publication_date",
      sort: "publication_date desc",
      rows: "20",
      wt: "json",
    });
    const res = await fetch(`http://api.plos.org/search?${params.toString()}`, {
      headers: { "User-Agent": "agentgit-bot/1.0" },
    });
    if (!res.ok) { console.warn(`[science-scheduler] PLOS API ${res.status}`); return []; }
    const data = await res.json() as PlosSolrResponse;
    const docs = (data.response?.docs ?? []).filter(d => {
      const abs = (d.abstract_primary_display ?? d.abstract ?? []).join(" ");
      return abs.length > 100;
    });

    return docs.slice(0, limit).map(d => {
      const doi = d.id.startsWith("10.") ? d.id : `10.1371/journal.pone.${d.id}`;
      const doiKey = doi.replace(/[^a-zA-Z0-9]/g, "-").slice(-40);
      const title = d.title_display ?? d.title ?? "PLOS ONE Article";
      const abstract = (d.abstract_primary_display ?? d.abstract ?? []).join(" ");
      const subjects = (d.subject ?? []).slice(0, 5).map(s => s.toLowerCase().replace(/\s+/g, "-"));
      return {
        slug: `plos-${doiKey}`,
        title,
        abstract,
        sourceUrl: `https://doi.org/${doi}`,
        source: "plos" as const,
        keywords: subjects.length ? subjects : ["open-science", "biology"],
        baseTags: ["plos-one", "science-math", "open-science"],
      };
    });
  } catch (err) {
    console.warn("[science-scheduler] PLOS fetch error:", err);
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────
   Source 7 — Nature RSS (High-Impact Papers)
   Parses raw RSS XML — CDATA-wrapped titles and descriptions
   ──────────────────────────────────────────────────────────────────── */
interface NatureItem {
  title: string;
  link: string;
  description: string;
}

function parseNatureRss(xml: string): NatureItem[] {
  const items: NatureItem[] = [];
  // Match each <item> block
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  for (const block of itemBlocks) {
    // Title: <title><![CDATA[...]]></title>  OR  <title>...</title>
    const titleMatch =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
      block.match(/<title>([\s\S]*?)<\/title>/);
    // Link: <link>url</link>  OR  <guid>url</guid>
    const linkMatch =
      block.match(/<link>(https?:\/\/[^\s<]+)<\/link>/) ??
      block.match(/<guid[^>]*>(https?:\/\/[^\s<]+)<\/guid>/);
    // Description: <description><![CDATA[...]]></description>  OR  <description>...</description>
    const descMatch =
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ??
      block.match(/<description>([\s\S]*?)<\/description>/);

    const title = titleMatch?.[1]?.trim() ?? "";
    const link  = linkMatch?.[1]?.trim() ?? "";
    const desc  = descMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";

    if (title && link && title.length > 10) {
      items.push({ title, link, description: desc });
    }
  }
  return items;
}

async function fetchNaturePapers(limit = 1): Promise<PaperEntry[]> {
  const RSS_URLS = [
    "https://www.nature.com/nature.rss",
    "https://www.nature.com/nbt.rss",       // Nature Biotechnology
    "https://www.nature.com/ncomms.rss",    // Nature Communications
  ];

  for (const rssUrl of RSS_URLS) {
    try {
      const res = await fetch(rssUrl, {
        headers: { "User-Agent": "agentgit-bot/1.0" },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseNatureRss(xml);
      if (items.length === 0) continue;

      return items.slice(0, limit).map(item => {
        // Generate slug from URL
        const urlKey = item.link
          .replace(/^https?:\/\/[^/]+\//, "")
          .replace(/[^a-zA-Z0-9]/g, "-")
          .slice(0, 60);
        const desc = item.description.length > 50
          ? item.description
          : `Nature paper: ${item.title}. Published in Nature journal series. See source for full abstract.`;
        return {
          slug: `nature-${urlKey}`,
          title: item.title,
          abstract: desc,
          sourceUrl: item.link,
          source: "nature" as const,
          keywords: ["nature", "high-impact", "peer-reviewed"],
          baseTags: ["nature", "science-math", "high-impact"],
        };
      });
    } catch (err) {
      console.warn(`[science-scheduler] Nature RSS error (${rssUrl}):`, err);
    }
  }
  return [];
}

/* ────────────────────────────────────────────────────────────────────
   Claude Haiku Code Generation (shared by all sources)
   ──────────────────────────────────────────────────────────────────── */
interface GeneratedFile { path: string; content: string; }

async function generateCodeImplementation(entry: PaperEntry): Promise<GeneratedFile[]> {
  const keywordStr = entry.keywords.length > 0
    ? entry.keywords.slice(0, 8).join(", ")
    : "scientific computing, data analysis";

  const prompt = `You are an expert researcher implementing scientific papers as clean, runnable Python code.

Paper: "${entry.title}"
Source: ${entry.sourceUrl}
Keywords: ${keywordStr}

Abstract:
${entry.abstract.slice(0, 2000)}

Generate a code implementation with exactly these 4 files. Output ONLY a JSON array (no markdown, no explanation):

[
  {"path": "README.md", "content": "..."},
  {"path": "main.py", "content": "..."},
  {"path": "utils.py", "content": "..."},
  {"path": "requirements.txt", "content": "..."}
]

Rules for README.md:
- Start with "# Implementation: ${entry.title.slice(0, 80)}"
- Include "**Source:** ${entry.sourceUrl}"
- Explain what the paper proposes and what the code implements
- Include a "Quick Start" section
- Add a "Paper2Code Notes" section listing [UNSPECIFIED] assumptions

Rules for main.py:
- Implement the core algorithm from the abstract
- Annotate each section: # §2.1 — method name or # [UNSPECIFIED] assumed X
- Include a __main__ block with a minimal runnable demo
- Keep it under 200 lines

Rules for utils.py:
- Helper functions for main.py, with docstrings

Rules for requirements.txt:
- Only real PyPI packages needed to run the code`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const cleaned = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();

    let files: GeneratedFile[];
    try {
      files = JSON.parse(cleaned) as GeneratedFile[];
    } catch {
      const match = cleaned.match(/\[[\s\S]+\]/);
      if (!match) throw new Error("No JSON array found in LLM response");
      files = JSON.parse(match[0]) as GeneratedFile[];
    }
    return files.filter(f => f.path && f.content);
  } catch (err) {
    console.warn(`[science-scheduler] Code gen error for "${entry.title.slice(0, 40)}":`, err);
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────
   Ensure bots exist (idempotent)
   ──────────────────────────────────────────────────────────────────── */
async function ensureBotsExist(bots: readonly ScienceBot[]): Promise<Map<string, string>> {
  const botNames = bots.map(b => b.name);
  const existing = await db
    .select({ name: agentsTable.name, id: agentsTable.id })
    .from(agentsTable)
    .where(inArray(agentsTable.name, botNames));

  const existingMap = new Map(existing.map(a => [a.name, a.id]));
  const result = new Map(existing.map(a => [a.name, a.id]));

  for (const bot of bots.filter(b => !existingMap.has(b.name))) {
    const apiKey = `vw-bot-${crypto.randomBytes(24).toString("hex")}`;
    const shareToken = crypto.randomBytes(16).toString("hex");
    const [created] = await db.insert(agentsTable).values({
      name: bot.name,
      bio: bot.bio,
      specialty: bot.specialty,
      model: bot.model,
      framework: bot.framework,
      avatarEmoji: bot.emoji,
      coverGradient: bot.gradient,
      isLocked: false,
      apiKeyHash: crypto.createHash("sha256").update(apiKey).digest("hex"),
      shareTokenHash: crypto.createHash("sha256").update(shareToken).digest("hex"),
      shareTokenClaimed: false,
    } as any).returning({ id: agentsTable.id });
    if (created) {
      result.set(bot.name, created.id);
      console.log(`[science-scheduler] Created bot @${bot.name}`);
    }
  }
  return result;
}

/* ────────────────────────────────────────────────────────────────────
   Post one paper as a code repo (generic)
   ──────────────────────────────────────────────────────────────────── */
async function postPaperRepo(
  entry: PaperEntry,
  agentName: string,
  agentId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: reposTable.id })
    .from(reposTable)
    .where(eq(reposTable.name, entry.slug))
    .limit(1);
  if (existing.length > 0) return false;

  const files = await generateCodeImplementation(entry);
  if (files.length === 0) {
    console.warn(`[science-scheduler] No files generated for "${entry.title.slice(0, 40)}"`);
    return false;
  }

  const fullName = `${agentName}/${entry.slug}`;
  const sha = crypto.randomBytes(20).toString("hex");
  const commitMsg = `paper2code: ${entry.slug} — ${entry.title.slice(0, 80)}`;

  const keywordTags = entry.keywords
    .slice(0, 3)
    .map(k => k.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));

  const tags = [...new Set([...entry.baseTags, ...keywordTags])].slice(0, 8);

  await db.transaction(async tx => {
    const [repo] = await tx.insert(reposTable).values({
      name: entry.slug,
      fullName,
      description: entry.title.slice(0, 300),
      language: "Python",
      tags,
      visibility: "public",
      isPublic: true,
      githubStars: 0,
      githubForks: 0,
      commitCount: 1,
      ownerName: agentName,
      ownerId: agentId,
      readme: files.find(f => f.path === "README.md")?.content ?? "",
      latestCommitSha: sha,
      latestCommitMessage: commitMsg,
      latestCommitAt: new Date(),
    } as any).returning({ id: reposTable.id });

    if (!repo) throw new Error("Insert returned nothing");

    await tx.insert(commitsTable).values({
      sha, repoId: repo.id, repoFullName: fullName,
      message: commitMsg, authorName: agentName, authorId: agentId,
      filesChanged: files.length,
      additions: files.reduce((s, f) => s + f.content.split("\n").length, 0),
      deletions: 0,
      files: files.map(f => ({ path: f.path, status: "added" })),
    });

    for (const f of files) {
      await tx.insert(repoFilesTable).values({
        repoId: repo.id, repoFullName: fullName,
        path: f.path, content: f.content,
        size: Buffer.byteLength(f.content, "utf8"),
        lastCommitSha: sha, lastCommitMessage: commitMsg, lastCommitAt: new Date(),
      });
    }
  });

  return true;
}

/* ────────────────────────────────────────────────────────────────────
   Shuffle helper
   ──────────────────────────────────────────────────────────────────── */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/* ────────────────────────────────────────────────────────────────────
   Bot pools by source
   ──────────────────────────────────────────────────────────────────── */
const ARXIV_BOT_NAMES    = ["euler-ai", "curie-agent", "gauss-dev", "turing-bot", "noether-agent"];
const BIORXIV_BOT_NAMES  = ["darwin-coder", "mendel-bot", "crick-agent"];
const MEDRXIV_BOT_NAMES  = ["hippocrates-ai", "pasteur-bot"];
const CHEMRXIV_BOT_NAMES = ["lavoisier-coder"];
const ESSOAR_BOT_NAMES   = ["humboldt-bot"];
const PLOS_BOT_NAMES     = ["lovelace-agent"];
const NATURE_BOT_NAMES   = ["faraday-dev"];

const ARXIV_BOTS    = ALL_SCIENCE_BOTS.filter(b => ARXIV_BOT_NAMES.includes(b.name));
const BIORXIV_BOTS  = ALL_SCIENCE_BOTS.filter(b => BIORXIV_BOT_NAMES.includes(b.name));
const MEDRXIV_BOTS  = ALL_SCIENCE_BOTS.filter(b => MEDRXIV_BOT_NAMES.includes(b.name));
const CHEMRXIV_BOTS = ALL_SCIENCE_BOTS.filter(b => CHEMRXIV_BOT_NAMES.includes(b.name));
const ESSOAR_BOTS   = ALL_SCIENCE_BOTS.filter(b => ESSOAR_BOT_NAMES.includes(b.name));
const PLOS_BOTS     = ALL_SCIENCE_BOTS.filter(b => PLOS_BOT_NAMES.includes(b.name));
const NATURE_BOTS   = ALL_SCIENCE_BOTS.filter(b => NATURE_BOT_NAMES.includes(b.name));

/* ────────────────────────────────────────────────────────────────────
   Process a batch of papers under a given bot pool
   ──────────────────────────────────────────────────────────────────── */
async function processPapers(
  papers: PaperEntry[],
  botEntries: [string, string][],
  sourceLabel: string,
): Promise<number> {
  let posted = 0;
  const bots = shuffle(botEntries);

  for (let i = 0; i < papers.length; i++) {
    const entry = papers[i]!;
    const [agentName, agentId] = bots[i % bots.length]!;
    await new Promise(r => setTimeout(r, 2_000));
    try {
      const ok = await postPaperRepo(entry, agentName, agentId);
      if (ok) {
        posted++;
        console.log(`[science-scheduler] @${agentName} posted ${sourceLabel}:${entry.slug} — ${entry.title.slice(0, 55)}`);
      } else {
        console.log(`[science-scheduler] Skipped ${entry.slug} (already exists)`);
      }
    } catch (err) {
      console.warn(`[science-scheduler] Failed ${entry.slug}:`, err);
    }
  }
  return posted;
}

/* ────────────────────────────────────────────────────────────────────
   arXiv category query strings
   ──────────────────────────────────────────────────────────────────── */
const MATH_QUERY =
  "cat:math.NA OR cat:math.CO OR cat:math.NT OR cat:math.AG OR " +
  "cat:math.DG OR cat:math.AP OR cat:math.PR OR cat:math.LO OR " +
  "cat:math.GR OR cat:math.DS";

const PHYSICS_ASTRO_QUERY =
  "cat:hep-th OR cat:quant-ph OR cat:gr-qc OR cat:hep-ph OR " +
  "cat:astro-ph.GA OR cat:astro-ph.CO OR cat:astro-ph.HE OR " +
  "cat:astro-ph.EP OR cat:astro-ph.SR OR cat:cond-mat.str-el";

const AI_THEORY_QUERY =
  "cat:cs.AI OR cat:cs.LG OR cat:stat.ML OR cat:cs.NE OR " +
  "cat:cs.CC OR cat:cs.IT OR cat:cs.LO";

/* ────────────────────────────────────────────────────────────────────
   Main daily science job — 10 theoretical papers/day from arXiv:
     Group A: 3 Pure Mathematics
     Group B: 4 Physics & Astronomy
     Group C: 3 AI Theory / CS Theory
   ──────────────────────────────────────────────────────────────────── */
export async function runArxivDailyJob(_isFirstRun = false) {
  console.log(`[science-scheduler] Running science job — ${new Date().toISOString()}`);

  const arxivIds = await ensureBotsExist(ARXIV_BOTS);
  const arxivEntries = [...arxivIds.entries()];

  // Bot assignment by specialty
  const mathBots    = arxivEntries.filter(([n]) => n === "euler-ai" || n === "gauss-dev");
  const physAstroBots = arxivEntries.filter(([n]) => n === "curie-agent" || n === "noether-agent");
  const aiTheoryBots  = arxivEntries.filter(([n]) => n === "turing-bot" || n === "gauss-dev");

  // Fetch 3 groups in parallel
  const [mathPapers, physAstroPapers, aiPapers] = await Promise.all([
    fetchArxivByCategory(MATH_QUERY,         3, "mathematics",   ["mathematics"]),
    fetchArxivByCategory(PHYSICS_ASTRO_QUERY, 4, "physics-astro", ["physics", "astronomy"]),
    fetchArxivByCategory(AI_THEORY_QUERY,    3, "ai-theory",     ["artificial-intelligence"]),
  ]);

  console.log(
    `[science-scheduler] Fetched: ${mathPapers.length} math, ` +
    `${physAstroPapers.length} physics/astro, ${aiPapers.length} AI-theory`,
  );

  let total = 0;
  total += await processPapers(mathPapers,     mathBots.length     ? mathBots     : arxivEntries, "math");
  total += await processPapers(physAstroPapers, physAstroBots.length ? physAstroBots : arxivEntries, "physics-astro");
  total += await processPapers(aiPapers,        aiTheoryBots.length  ? aiTheoryBots  : arxivEntries, "ai-theory");

  console.log(`[science-scheduler] Done — ${total} new paper implementations posted.`);
}

/* ────────────────────────────────────────────────────────────────────
   Start scheduler
   ──────────────────────────────────────────────────────────────────── */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startArxivScheduler() {
  // First run (30 s after startup): high-volume legacy mode
  setTimeout(() => {
    runArxivDailyJob(true).catch(err =>
      console.error("[science-scheduler] error:", err),
    );
  }, 30_000);

  // Subsequent runs: steady-state 10 papers/day across all 7 sources
  setInterval(() => {
    runArxivDailyJob(false).catch(err =>
      console.error("[science-scheduler] error:", err),
    );
  }, INTERVAL_MS);

  console.log("[science-scheduler] Started — arXiv direct (math + physics/astro + AI-theory), 10 papers/day, every 24 h.");
}
