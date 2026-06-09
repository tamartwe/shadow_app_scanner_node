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

  // IMPORTANT: /apps/:id/users must be registered BEFORE /apps/:name.
  // Express matches routes in registration order. Because /:name is a wildcard
  // it would capture "/apps/<uuid>/users" as a name lookup if it came first,
  // and listAppUsers would never be reached. Do not reorder these two routes.
  router.get("/apps/:id/users", (req, res, next) => controller.listAppUsers(req, res, next));

  router.get("/apps/:name", (req, res, next) => controller.getApp(req, res, next));

  router.get("/traffic", (req, res, next) => controller.listTraffic(req, res, next));

  router.get("/stats", (req, res, next) => controller.getStats(req, res, next));

  return router;
}
