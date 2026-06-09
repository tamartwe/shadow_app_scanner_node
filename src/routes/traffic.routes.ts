import { Router, RequestHandler } from "express";
import { TrafficController } from "../controllers/traffic.controller";

export function createTrafficRouter(
  controller: TrafficController,
  trafficRateLimit: RequestHandler
): Router {
  const router = Router();

  router.post("/traffic", trafficRateLimit, (req, res) =>
    controller.ingestTraffic(req, res)
  );

  router.get("/apps", (req, res) => controller.listApps(req, res));

  router.get("/apps/:id/users", (req, res) => controller.listAppUsers(req, res));

  router.get("/apps/:name", (req, res) => controller.getApp(req, res));

  router.get("/traffic", (req, res) => controller.listTraffic(req, res));

  router.get("/stats", (req, res) => controller.getStats(req, res));

  return router;
}
