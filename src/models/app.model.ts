import { AuthType } from "./traffic.model";

export type RiskLevel = "low" | "medium" | "high";

export interface IdentityPosture {
  authTypesUsed: AuthType[];
  hasUnauthenticated: boolean;
  riskLevel: RiskLevel;
}

// Per-user access record tracked inside DiscoveredApp
export interface UserAccess {
  userId: string;
  firstSeen: Date;
  lastSeen: Date;
  authTypesUsed: Set<AuthType>;
}

export interface DiscoveredApp {
  id: string;
  name: string;
  firstSeen: Date;
  lastSeen: Date;
  authTypesUsed: Set<AuthType>;
  userAccess: Map<string, UserAccess>;
  trafficCount: number;
}

export interface AppProfile {
  id: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
  userCount: number;
  trafficCount: number;
  identityPosture: IdentityPosture;
}

// API shape returned by GET /apps/:id/users
export interface UserProfile {
  userId: string;
  firstSeen: string;
  lastSeen: string;
  authTypesUsed: AuthType[];
}

export interface PaginatedApps {
  apps: AppProfile[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedUsers {
  users: UserProfile[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
