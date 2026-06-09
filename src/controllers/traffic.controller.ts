import { Request, Response, NextFunction } from "express";
import { TrafficRecordSchema } from "../schemas/traffic.schema";
import { PaginationSchema } from "../schemas/pagination.schema";
import { TrafficService } from "../services/traffic.service";

export class TrafficController {
  constructor(private readonly service: TrafficService) {}

  ingestTraffic(req: Request, res: Response, next: NextFunction): void {
    try {
      const parseResult = TrafficRecordSchema.safeParse(req.body);

      if (!parseResult.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        });
        return;
      }

      const result = this.service.ingest(parseResult.data);

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
    } catch (err) {
      next(err);
    }
  }

  listApps(req: Request, res: Response, next: NextFunction): void {
    try {
      const parseResult = PaginationSchema.safeParse(req.query);

      if (!parseResult.success) {
        res.status(400).json({
          error: "Invalid pagination parameters",
          details: parseResult.error.flatten().fieldErrors,
        });
        return;
      }

      const { page, limit } = parseResult.data;
      res.status(200).json(this.service.getApps(page, limit));
    } catch (err) {
      next(err);
    }
  }

  getApp(req: Request, res: Response, next: NextFunction): void {
    try {
      const name = req.params["name"] as string;
      const app = this.service.getAppByName(name);

      if (!app) {
        res.status(404).json({ error: `App '${name}' not found` });
        return;
      }

      res.status(200).json({ app });
    } catch (err) {
      next(err);
    }
  }

  listAppUsers(req: Request, res: Response, next: NextFunction): void {
    try {
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
      const result = this.service.getAppUsers(id, page, limit);

      if (!result) {
        res.status(404).json({ error: `App '${id}' not found` });
        return;
      }

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  listTraffic(req: Request, res: Response, next: NextFunction): void {
    try {
      const pageResult = PaginationSchema.safeParse(req.query);
      if (!pageResult.success) {
        res.status(400).json({
          error: "Invalid pagination parameters",
          details: pageResult.error.flatten().fieldErrors,
        });
        return;
      }

      const { page, limit } = pageResult.data;
      res.status(200).json(this.service.getTraffic(page, limit));
    } catch (err) {
      next(err);
    }
  }

  getStats(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.status(200).json(this.service.getStats());
    } catch (err) {
      next(err);
    }
  }
}
