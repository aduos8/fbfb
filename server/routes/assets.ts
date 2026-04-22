import type { RequestHandler } from "express";
import fs from "fs";
import path from "path";

const ASSETS_ROOT = process.env.ASSETS_LOCAL_PATH || "/mnt/hetzner/media";

function guessContentType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function parseAssetPathFromUrl(url: string): string | null {
  const pathname = url.split("?")[0] ?? "";
  const raw = pathname.replace(/^\/+/, "");
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const normalized = decoded.replace(/^\/+/, "");
  if (!normalized) return null;
  const parts = normalized.split("/");
  if (parts.some((p) => p === ".." || p === "." || p.includes("\\"))) return null;
  return normalized;
}

export const handleAssets: RequestHandler = (req, res) => {
  const stripped = req.path.replace(/^\/api\/(assets|images)\/?/, "");
  const assetPath = parseAssetPathFromUrl(stripped);
  if (!assetPath) { res.status(400).json({ error: "Invalid asset path" }); return; }

  const abs = path.join(ASSETS_ROOT, assetPath);
  if (!abs.startsWith(ASSETS_ROOT)) { res.status(400).json({ error: "Invalid asset path" }); return; }

  if (!fs.existsSync(abs)) { res.status(404).json({ error: "Not found" }); return; }

  res.setHeader("Content-Type", guessContentType(assetPath));
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(abs);
};
