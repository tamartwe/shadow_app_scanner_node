import { Router, RequestHandler } from "express";
import { TrafficController } from "../controllers/traffic.controller";

export function createTrafficRouter(
  controller: TrafficController,
  trafficRateLimit: RequestHandler
): Router {
  const router = Router();

  router.post("/traffic", trafficRateLimit, (req, res, next) =>
    controller.ingestTraffic(req, res, next)
  );

  router.get("/apps", (req, res, next) => controller.listApps(req, res, next));

  // Static paths — no wildcard, no ordering constraints
  router.get("/apps/lookup", (req, res, next) => controller.getApp(req, res, next));

  router.get("/apps/:id/users", (req, res, next) => controller.listAppUsers(req, res, next));

  router.get("/traffic", (req, res, next) => controller.listTraffic(req, res, next));

  router.get("/stats", (req, res, next) => controller.getStats(req, res, next));

  return router;
}
