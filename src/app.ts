import express, { Application, Request, Response, NextFunction } from "express";
import { MemoryStore } from "express-rate-limit";
import { AppRepository } from "./repositories/app.repository";
import { TrafficRepository } from "./repositories/traffic.repository";
import { TrafficService } from "./services/traffic.service";
import { TrafficController } from "./controllers/traffic.controller";
import { createTrafficRouter } from "./routes/traffic.routes";
import { createTrafficRateLimit } from "./middleware/trafficRateLimit";
import logger from "./logger";

export interface AppDependencies {
  appRepository?: AppRepository;
  trafficRepository?: TrafficRepository;
  rateLimitStore?: MemoryStore;
}

export function createApp(deps: AppDependencies = {}): Application {
  const appRepo = deps.appRepository ?? new AppRepository();
  const trafficRepo = deps.trafficRepository ?? new TrafficRepository();
  const rateLimitStore = deps.rateLimitStore ?? new MemoryStore();

  const service = new TrafficService(trafficRepo, appRepo);
  const controller = new TrafficController(service);
  const trafficRateLimit = createTrafficRateLimit(rateLimitStore);
  const router = createTrafficRouter(controller, trafficRateLimit);

  const app = express();

  app.use(express.json());
  app.use("/api", router);

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

  return app;
}
