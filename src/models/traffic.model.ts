import { z } from "zod";
import { AuthTypeSchema } from "../schemas/traffic.schema";

// Derived from the Zod enum — single source of truth
export type AuthType = z.infer<typeof AuthTypeSchema>;

export interface TrafficRecord {
  id: string;
  sourceIp: string;
  destinationApp: string;
  authType: AuthType;
  userId: string;
  timestamp: string;
  ingestedAt: Date;
}

export interface PaginatedTraffic {
  records: TrafficRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
