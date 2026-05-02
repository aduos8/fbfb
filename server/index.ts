import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as trpcExpress from "@trpc/server/adapters/express";
import { handleDemo } from "./routes/demo";
import { testConnection, closeConnection } from "./lib/db";
import { getCassandraClient } from "./lib/tg-queries/cassandra";
import { getSearchBackend, healthCheckSearchBackend } from "./lib/tg-queries/searchIndex";
import { startTrackingMonitor, stopTrackingMonitor } from "./lib/trackingMonitor";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import oxapayWebhook from "./routes/webhooks/oxapay";
import { handleAssets } from "./routes/assets";
import { handlePublicApiCredits, handlePublicApiSearch } from "./routes/publicApi";
import path from "path";

export function createServer() {
  const app = express();
  const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";
  const isProd = process.env.NODE_ENV === "production";
  const searchBackend = getSearchBackend();

  if (isProd && !isVercel) {
    app.set("trust proxy", 1);
  }

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.cdnfonts.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.cdnfonts.com", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: (origin, callback) => {
      const allowedOrigins = isProd
        ? (process.env.ALLOWED_ORIGINS?.split(",") ?? ["https://yourdomain.com"])
        : ["http://localhost:3000", "http://localhost:5173", "http://localhost:8082"];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    maxAge: 86400,
  }));

  app.use(express.urlencoded({ extended: true, limit: "10kb" }));

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const p = req.path;
      // Never rate-limit static frontend assets. If these get limited, browsers will try to
      // interpret the JSON error body as CSS/JS (MIME type errors + blank pages).
      if (p === "/api/ping") return true;
      if (p === "/health" || p === "/api/health") return true;
      if (p.startsWith("/assets/")) return true;
      if (p === "/favicon.ico" || p === "/robots.txt" || p === "/sitemap.xml") return true;
      return false;
    },
  });

  app.use(globalLimiter);

  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/health", async (_req, res) => {
    const postgresOk = await testConnection();

    const cassandraOk = await (async () => {
      try {
        const client = getCassandraClient();
        await client.connect();
        await client.execute("SELECT keyspace_name FROM system_schema.keyspaces LIMIT 1");
        return true;
      } catch {
        return false;
      }
    })();

    const searchOk = await (async () => {
      const hasOpenSearchConfig = Boolean(process.env.OPENSEARCH_URL);
      const hasMeilisearchConfig = Boolean(process.env.MEILISEARCH_URL && process.env.MEILISEARCH_API_KEY);
      if ((searchBackend === "opensearch" && !hasOpenSearchConfig)
        || (searchBackend === "meilisearch" && !hasMeilisearchConfig)) {
        return false;
      }

      try {
        const result = await healthCheckSearchBackend();
        return result.healthy;
      } catch {
        return false;
      }
    })();

    const healthy = postgresOk && cassandraOk && searchOk;
    const searchStatus = searchOk ? "ok" : "down";
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      services: {
        postgres: postgresOk ? "ok" : "down",
        cassandra: cassandraOk ? "ok" : "down",
        search: searchStatus,
        meilisearch: searchBackend === "meilisearch" ? searchStatus : "inactive",
        opensearch: searchBackend === "opensearch" ? searchStatus : "inactive",
      },
      search: {
        backend: searchBackend,
        status: searchStatus,
      },
    });
  });

  app.get("/api/health", async (_req, res) => {
    const postgresOk = await testConnection();

    const cassandraOk = await (async () => {
      try {
        const client = getCassandraClient();
        await client.connect();
        await client.execute("SELECT keyspace_name FROM system_schema.keyspaces LIMIT 1");
        return true;
      } catch {
        return false;
      }
    })();

    const searchOk = await (async () => {
      const hasOpenSearchConfig = Boolean(process.env.OPENSEARCH_URL);
      const hasMeilisearchConfig = Boolean(process.env.MEILISEARCH_URL && process.env.MEILISEARCH_API_KEY);
      if ((searchBackend === "opensearch" && !hasOpenSearchConfig)
        || (searchBackend === "meilisearch" && !hasMeilisearchConfig)) {
        return false;
      }

      try {
        const result = await healthCheckSearchBackend();
        return result.healthy;
      } catch {
        return false;
      }
    })();

    const healthy = postgresOk && cassandraOk && searchOk;
    const searchStatus = searchOk ? "ok" : "down";
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      services: {
        postgres: postgresOk ? "ok" : "down",
        cassandra: cassandraOk ? "ok" : "down",
        search: searchStatus,
        meilisearch: searchBackend === "meilisearch" ? searchStatus : "inactive",
        opensearch: searchBackend === "opensearch" ? searchStatus : "inactive",
      },
      search: {
        backend: searchBackend,
        status: searchStatus,
      },
    });
  });
  
  app.get("/api/demo", handleDemo);
  app.post("/api/demo", express.json({ limit: "10kb" }), handleDemo);

  app.use("/api/assets", handleAssets);

  app.post("/api/v1/search", express.json({ limit: "50kb" }), handlePublicApiSearch);
  app.get("/api/v1/credits", handlePublicApiCredits);

  app.post("/api/webhooks/oxapay", express.json({ limit: "10kb" }), oxapayWebhook);

  const trpcHandler = trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      if (error.code !== "UNAUTHORIZED" && error.code !== "FORBIDDEN") {
        console.error(`tRPC error on ${path}:`, error.message);
      }
    },
  });

  app.use("/api/trpc", express.json({ limit: "10kb" }), trpcHandler);

  if (process.env.NODE_ENV === "production" && !isVercel) {
    const distPath = path.join(process.cwd(), "dist", "spa");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"), (err) => {
        if (err) {
          res.status(404).json({ error: "Not found" });
        }
      });
    });
  } else {
    app.use((_req: express.Request, res: express.Response) => {
      res.status(404).json({ error: "Not found" });
    });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[ERROR]", err.message);
    if (err.message.includes("CORS")) {
      res.status(403).json({ error: "CORS policy violation" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  testConnection().then((ok) => {
    if (ok) {
      console.log("PostgreSQL connected");
    } else {
      console.warn("PostgreSQL connection failed, continuing anyway");
    }
  });

  if (!isVercel) {
    startTrackingMonitor();
  }

  return app;
}

export async function closeAppResources() {
  stopTrackingMonitor();
  await closeConnection();
}

export { closeAppResources as closeConnection };
