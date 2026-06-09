import { randomUUID } from "crypto";
import { TrafficRecord, PaginatedTraffic } from "../models/traffic.model";
import { AppProfile, PaginatedApps, PaginatedUsers } from "../models/app.model";
import { TrafficRecordInput } from "../schemas/traffic.schema";
import { trafficRepository } from "../repositories/traffic.repository";
import { appRepository } from "../repositories/app.repository";

export interface IngestResult {
  record: TrafficRecord;
  app: AppProfile;
  discovered: boolean;
}

class TrafficService {
  ingest(input: TrafficRecordInput): IngestResult {
    const now = new Date();

    const record: TrafficRecord = {
      id: randomUUID(),
      ...input,
      ingestedAt: now,
    };

    trafficRepository.save(record);

    const seenAt = new Date(input.timestamp);
    const { app, isNew } = appRepository.upsertFromTraffic(
      input.destinationApp,
      input.authType,
      input.userId,
      seenAt
    );

    return {
      record,
      app: appRepository.toProfile(app),
      discovered: isNew,
    };
  }

  getApps(page: number, limit: number): PaginatedApps {
    const { items, total } = appRepository.findPaginated(page, limit);
    return {
      apps: items.map((app) => appRepository.toProfile(app)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  getAppByName(name: string): AppProfile | undefined {
    const app = appRepository.findByName(name);
    return app ? appRepository.toProfile(app) : undefined;
  }

  getAppUsers(appId: string, page: number, limit: number): PaginatedUsers | undefined {
    const result = appRepository.getUsersForApp(appId, page, limit);
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
    const { items, total } = trafficRepository.findPaginated(page, limit);
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
      totalTrafficRecords: trafficRepository.count(),
      totalDiscoveredApps: appRepository.count(),
    };
  }
}

export const trafficService = new TrafficService();
