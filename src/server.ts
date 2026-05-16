import express, { Express } from "express";
import * as path from "path";
import { buildApiRouter } from "./api";
import { config } from "./config";
import { log } from "./utils";

export function buildServer(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.use("/api", buildApiRouter());

  app.use(
    "/assets",
    express.static(config.assetsDir, {
      fallthrough: true,
      maxAge: "1d",
      index: false,
    }),
  );

  app.use(
    express.static(config.publicDir, {
      fallthrough: true,
      maxAge: "5m",
      index: ["index.html"],
    }),
  );

  app.get("*", (_req, res) => {
    res.sendFile(path.join(config.publicDir, "index.html"));
  });

  return app;
}

export function startServer(): void {
  const app = buildServer();
  app.listen(config.port, () => {
    log("http_listening", { port: config.port, publicDir: config.publicDir });
  });
}
