import { LRUCache } from "lru-cache";
import { TrafficRecord } from "../models/traffic.model";
import logger from "../logger";

const CAPACITY = 10_000;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 1 month

export class TrafficRepository {
  private cache: LRUCache<string, TrafficRecord>;

  constructor() {
    this.cache = new LRUCache<string, TrafficRecord>({
      max: CAPACITY,
      ttl: TTL_MS,
      allowStale: false,
      updateAgeOnGet: false,
      dispose: (record, id, reason) => {
        if (reason === "evict") {
          logger.warn(`Traffic record evicted (capacity): ${id}`);
        } else if (reason === "expire") {
          logger.debug(`Traffic record expired (TTL): ${id}`);
        }
      },
    });
  }

  save(record: TrafficRecord): TrafficRecord {
    this.cache.set(record.id, record);
    return record;
  }

  findAll(): TrafficRecord[] {
    return Array.from(this.cache.values());
  }

  findPaginated(page: number, limit: number): { items: TrafficRecord[]; total: number } {
    const all = Array.from(this.cache.values());
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length };
  }

  findById(id: string): TrafficRecord | undefined {
    return this.cache.get(id);
  }

  count(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

