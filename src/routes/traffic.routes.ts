import { Router } from "express";
import { trafficController } from "../controllers/traffic.controller";
import { trafficRateLimit } from "../middleware/trafficRateLimit";

const router = Router();

router.post("/traffic", trafficRateLimit, (req, res) =>
  trafficController.ingestTraffic(req, res)
);

router.get("/apps", (req, res) => trafficController.listApps(req, res));

router.get("/apps/:id/users", (req, res) => trafficController.listAppUsers(req, res));

router.get("/apps/:name", (req, res) => trafficController.getApp(req, res));

router.get("/traffic", (req, res) => trafficController.listTraffic(req, res));

router.get("/stats", (req, res) => trafficController.getStats(req, res));

export default router;
