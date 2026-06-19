const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || "80");

const html = fs.readFileSync(
  path.join(__dirname, "maintenance.html"),
  "utf8",
);

function applyMaintenanceHeaders(res, url) {
  res.statusCode = 503;
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Retry-After", "60");
  res.setHeader("X-Arena-Maintenance", "true");
  res.setHeader("X-Request-Path", url);
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const pathname = url.split("?")[0];

  if (pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (pathname === "/api/health") {
    applyMaintenanceHeaders(res, url);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "maintenance" }));
    return;
  }

  applyMaintenanceHeaders(res, url);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
});

server.listen(port, () => {
  console.log(`Maintenance server listening on :${port}`);
});