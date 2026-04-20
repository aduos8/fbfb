import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as trpcExpress from "@trpc/server/adapters/express";
import { handleDemo } from "./routes/demo";
import { testConnection, closeConnection } from "./lib/db";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import oxapayWebhook from "./routes/webhooks/oxapay";
import path from "path";

export function createServer() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: (origin, callback) => {
      const allowedOrigins = process.env.NODE_ENV === "production"
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
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }));

  app.use(express.urlencoded({ extended: true, limit: "10kb" }));

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/api/ping",
  });

  app.use(globalLimiter);

  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/debug/env", (_req, res) => {
    const oxaKey = process.env.OXAPAY_MERCHANT_KEY;
    res.json({
      oxaKey: oxaKey ? oxaKey.slice(0, 4) + '...' + oxaKey.slice(-4) : 'NOT SET',
      oxaKeyLength: oxaKey?.length,
      publicUrl: process.env.PUBLIC_URL,
      pingMessage: process.env.PING_MESSAGE,
    });
  });

  app.get("/api/demo", handleDemo);
  app.post("/api/demo", express.json({ limit: "10kb" }), handleDemo);

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

  if (process.env.NODE_ENV === "production") {
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

  return app;
}

export { closeConnection };
