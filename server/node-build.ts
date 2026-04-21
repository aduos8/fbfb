import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer, closeConnection } from "./index";

const server = createServer();

const port = process.env.PORT || 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "../spa");

server.use(express.static(distPath));

server.use((req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(distPath, "index.html"));
});

server.listen(port, () => {
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully`);
  await closeConnection();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
