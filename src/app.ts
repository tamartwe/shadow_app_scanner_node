import express, { Application, Request, Response, NextFunction } from "express";
import trafficRoutes from "./routes/traffic.routes";
import logger from "./logger";

const app: Application = express();

app.use(express.json());

app.use("/api", trafficRoutes);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

export default app;
