import { Request, Response } from "express";
import { TrafficRecordSchema } from "../schemas/traffic.schema";
import { PaginationSchema } from "../schemas/pagination.schema";
import { trafficService } from "../services/traffic.service";

class TrafficController {
  ingestTraffic(req: Request, res: Response): void {
    const parseResult = TrafficRecordSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const result = trafficService.ingest(parseResult.data);

    res.status(201).json({
      message: result.discovered
        ? `New app discovered: ${result.app.name}`
        : `Traffic recorded for known app: ${result.app.name}`,
      discovered: result.discovered,
      record: {
        id: result.record.id,
        sourceIp: result.record.sourceIp,
        destinationApp: result.record.destinationApp,
        authType: result.record.authType,
        userId: result.record.userId,
        timestamp: result.record.timestamp,
        ingestedAt: result.record.ingestedAt,
      },
      app: result.app,
    });
  }

  listApps(req: Request, res: Response): void {
    const parseResult = PaginationSchema.safeParse(req.query);

    if (!parseResult.success) {
      res.status(400).json({
        error: "Invalid pagination parameters",
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { page, limit } = parseResult.data;
    res.status(200).json(trafficService.getApps(page, limit));
  }

  getApp(req: Request, res: Response): void {
    const name = req.params["name"] as string;
    const app = trafficService.getAppByName(name);

    if (!app) {
      res.status(404).json({ error: `App '${name}' not found` });
      return;
    }

    res.status(200).json({ app });
  }

  listAppUsers(req: Request, res: Response): void {
    const id = req.params["id"] as string;

    const pageResult = PaginationSchema.safeParse(req.query);
    if (!pageResult.success) {
      res.status(400).json({
        error: "Invalid pagination parameters",
        details: pageResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { page, limit } = pageResult.data;
    const result = trafficService.getAppUsers(id, page, limit);

    if (!result) {
      res.status(404).json({ error: `App '${id}' not found` });
      return;
    }

    res.status(200).json(result);
  }

  listTraffic(req: Request, res: Response): void {
    const pageResult = PaginationSchema.safeParse(req.query);
    if (!pageResult.success) {
      res.status(400).json({
        error: "Invalid pagination parameters",
        details: pageResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { page, limit } = pageResult.data;
    res.status(200).json(trafficService.getTraffic(page, limit));
  }

  getStats(_req: Request, res: Response): void {
    res.status(200).json(trafficService.getStats());
  }
}

export const trafficController = new TrafficController();
