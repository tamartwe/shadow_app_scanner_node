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

  // IMPORTANT: /apps/:id/users must be registered BEFORE /apps/:name.
  // Express matches routes in registration order. Because /:name is a wildcard
  // it would capture "/apps/<uuid>/users" as a name lookup if it came first,
  // and listAppUsers would never be reached. Do not reorder these two routes.
  router.get("/apps/:id/users", (req, res) => controller.listAppUsers(req, res));

  router.get("/apps/:name", (req, res) => controller.getApp(req, res));

  router.get("/traffic", (req, res) => controller.listTraffic(req, res));

  router.get("/stats", (req, res) => controller.getStats(req, res));

  return router;
}
