export type AuthType = "none" | "basic" | "oauth" | "saml";

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
