import { randomUUID } from "crypto";
import {
  DiscoveredApp,
  AppProfile,
  IdentityPosture,
  RiskLevel,
  UserAccess,
  UserProfile,
} from "../models/app.model";
import { AuthType } from "../models/traffic.model";

export class AppRepository {
  // Dual index: O(1) lookup by both id and name
  private byId: Map<string, DiscoveredApp> = new Map();
  private byName: Map<string, DiscoveredApp> = new Map();

  findById(id: string): DiscoveredApp | undefined {
    return this.byId.get(id);
  }

  findByName(name: string): DiscoveredApp | undefined {
    return this.byName.get(name);
  }

  findAll(): DiscoveredApp[] {
    return Array.from(this.byId.values());
  }

  findPaginated(page: number, limit: number): { items: DiscoveredApp[]; total: number } {
    const all = Array.from(this.byId.values());
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length };
  }

  upsertFromTraffic(
    appName: string,
    authType: AuthType,
    userId: string,
    seenAt: Date
  ): { app: DiscoveredApp; isNew: boolean } {
    const existing = this.byName.get(appName);

    if (!existing) {
      const userAccess: UserAccess = {
        userId,
        firstSeen: seenAt,
        lastSeen: seenAt,
        authTypesUsed: new Set([authType]),
      };
      const newApp: DiscoveredApp = {
        id: randomUUID(),
        name: appName,
        firstSeen: seenAt,
        lastSeen: seenAt,
        authTypesUsed: new Set([authType]),
        userAccess: new Map([[userId, userAccess]]),
        trafficCount: 1,
      };
      this.byId.set(newApp.id, newApp);
      this.byName.set(appName, newApp);
      return { app: newApp, isNew: true };
    }

    existing.lastSeen = seenAt;
    existing.authTypesUsed.add(authType);
    existing.trafficCount += 1;

    const access = existing.userAccess.get(userId);
    if (access) {
      access.lastSeen = seenAt;
      access.authTypesUsed.add(authType);
    } else {
      existing.userAccess.set(userId, {
        userId,
        firstSeen: seenAt,
        lastSeen: seenAt,
        authTypesUsed: new Set([authType]),
      });
    }

    return { app: existing, isNew: false };
  }

  getUsersForApp(
    appId: string,
    page: number,
    limit: number
  ): { items: UserProfile[]; total: number } | undefined {
    const app = this.byId.get(appId);
    if (!app) return undefined;

    const all = Array.from(app.userAccess.values()).map((access) => ({
      userId: access.userId,
      firstSeen: access.firstSeen.toISOString(),
      lastSeen: access.lastSeen.toISOString(),
      authTypesUsed: Array.from(access.authTypesUsed),
    }));

    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length };
  }

  toProfile(app: DiscoveredApp): AppProfile {
    return {
      id: app.id,
      name: app.name,
      firstSeen: app.firstSeen.toISOString(),
      lastSeen: app.lastSeen.toISOString(),
      userCount: app.userAccess.size,
      trafficCount: app.trafficCount,
      identityPosture: this.buildIdentityPosture(app.authTypesUsed),
    };
  }

  private buildIdentityPosture(authTypesUsed: Set<AuthType>): IdentityPosture {
    const hasUnauthenticated = authTypesUsed.has("none");

    let riskLevel: RiskLevel;
    if (hasUnauthenticated) {
      riskLevel = "high";
    } else if (authTypesUsed.has("basic") && authTypesUsed.size === 1) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    return {
      authTypesUsed: Array.from(authTypesUsed),
      hasUnauthenticated,
      riskLevel,
    };
  }

  count(): number {
    return this.byId.size;
  }

  clear(): void {
    this.byId.clear();
    this.byName.clear();
  }
}

