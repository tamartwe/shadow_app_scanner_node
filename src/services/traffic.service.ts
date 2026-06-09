import { randomUUID } from "crypto";
import { TrafficRecord, PaginatedTraffic } from "../models/traffic.model";
import { AppProfile, PaginatedApps, PaginatedUsers } from "../models/app.model";
import { TrafficRecordInput } from "../schemas/traffic.schema";
import { TrafficRepository } from "../repositories/traffic.repository";
import { AppRepository } from "../repositories/app.repository";

export interface IngestResult {
  record: TrafficRecord;
  app: AppProfile;
  discovered: boolean;
}

export class TrafficService {
  constructor(
    private readonly trafficRepo: TrafficRepository,
    private readonly appRepo: AppRepository
  ) {}

  ingest(input: TrafficRecordInput): IngestResult {
    const record: TrafficRecord = {
      id: randomUUID(),
      ...input,
      ingestedAt: new Date(),
    };

    this.trafficRepo.save(record);

    const seenAt = new Date(input.timestamp);
    const { app, isNew } = this.appRepo.upsertFromTraffic(
      input.destinationApp,
      input.authType,
      input.userId,
      seenAt
    );

    return {
      record,
      app: this.appRepo.toProfile(app),
      discovered: isNew,
    };
  }

  getApps(page: number, limit: number): PaginatedApps {
    const { items, total } = this.appRepo.findPaginated(page, limit);
    return {
      apps: items.map((app) => this.appRepo.toProfile(app)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  getAppByName(name: string): AppProfile | undefined {
    const app = this.appRepo.findByName(name);
    return app ? this.appRepo.toProfile(app) : undefined;
  }

  getAppUsers(appId: string, page: number, limit: number): PaginatedUsers | undefined {
    const result = this.appRepo.getUsersForApp(appId, page, limit);
    if (!result) return undefined;
    return {
      users: result.items,
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  getTraffic(page: number, limit: number): PaginatedTraffic {
    const { items, total } = this.trafficRepo.findPaginated(page, limit);
    return {
      records: items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  getStats(): { totalTrafficRecords: number; totalDiscoveredApps: number } {
    return {
      totalTrafficRecords: this.trafficRepo.count(),
      totalDiscoveredApps: this.appRepo.count(),
    };
  }
}
