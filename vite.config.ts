import "dotenv/config";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import express from "express";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "./server/trpc/router";
import { createContext } from "./server/trpc/context";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8082,
    fs: {
      allow: ["./client", "./shared", "index.html"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve",
    configureServer(server) {
      const app = express();
      app.use(express.json({ limit: "10kb" }));

      const trpcHandler = trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext: async (opts) => createContext(opts as any),
        onError({ error, path }) {
          if (error.code !== "UNAUTHORIZED" && error.code !== "FORBIDDEN") {
            console.error(`tRPC error on ${path}:`, error.message);
          }
        },
      });

      app.use("/api/trpc", trpcHandler);
      app.get("/api/ping", (_req, res) => {
        res.json({ message: "pong" });
      });

      server.middlewares.use(app);
    },
  };
}
