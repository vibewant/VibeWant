import express, { type Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import router from "./routes/index.js";

const app: Express = express();

app.set("trust proxy", 1);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /\.replit\.dev$/,
  /\.repl\.co$/,
  /\.replit\.app$/,
];

const EXTRA_ORIGINS: Set<string> = new Set(
  (process.env.CORS_EXTRA_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

function isOriginAllowed(origin: string): boolean {
  if (EXTRA_ORIGINS.has(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin));
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) { callback(null, true); return; }
    if (isOriginAllowed(origin)) callback(null, true);
    else callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Agent-Key"],
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: "timeout", message: "Request timed out. Please try again." });
    }
  }, 30_000);
  res.on("finish", () => clearTimeout(timer));
  res.on("close", () => clearTimeout(timer));
  next();
});

app.use("/api", router);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.startsWith("CORS:")) {
    res.status(403).json({ error: "forbidden", message: err.message });
    return;
  }
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "internal_error", message: "An unexpected error occurred" });
});

export default app;
