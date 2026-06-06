const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const DIST = path.join(ROOT, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon"
};

function startDistServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    let rel = urlPath.replace(/^\/+/, "");
    if (rel === "" || rel.endsWith("/")) rel += "index.html";

    const filePath = path.resolve(DIST, rel);
    if (!filePath.startsWith(DIST + path.sep) && filePath !== DIST) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }

    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
      res.end(buf);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

module.exports = { DIST, startDistServer };
