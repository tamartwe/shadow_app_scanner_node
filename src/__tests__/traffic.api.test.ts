import request from "supertest";
import express, { Application } from "express";
import { MemoryStore } from "express-rate-limit";
import { createApp } from "../app";
import { TrafficController } from "../controllers/traffic.controller";
import { TrafficService } from "../services/traffic.service";
import { createTrafficRouter } from "../routes/traffic.routes";
import { createTrafficRateLimit } from "../middleware/trafficRateLimit";

const VALID_RECORD = {
  sourceIp: "192.168.1.1",
  destinationApp: "slack",
  authType: "oauth",
  userId: "user-1",
  timestamp: "2026-06-01T10:00:00.000Z",
};

// Each test gets a fresh app — no manual repository or rate-limiter clearing needed
let app: Application;
beforeEach(() => {
  app = createApp();
});

// ---------------------------------------------------------------------------
// POST /api/traffic
// ---------------------------------------------------------------------------
describe("POST /api/traffic", () => {
  it("returns 201 and marks the app as newly discovered on first ingestion", async () => {
    const res = await request(app).post("/api/traffic").send(VALID_RECORD);

    expect(res.status).toBe(201);
    expect(res.body.discovered).toBe(true);
    expect(res.body.message).toMatch(/New app discovered: slack/);
    expect(res.body.record).toMatchObject({
      sourceIp: VALID_RECORD.sourceIp,
      destinationApp: VALID_RECORD.destinationApp,
      authType: VALID_RECORD.authType,
      userId: VALID_RECORD.userId,
      timestamp: VALID_RECORD.timestamp,
    });
    expect(res.body.record.id).toBeDefined();
    expect(res.body.record.ingestedAt).toBeDefined();
    expect(res.body.app.id).toBeDefined();
  });

  it("returns discovered:false when the same app is seen again", async () => {
    await request(app).post("/api/traffic").send(VALID_RECORD);
    const res = await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, userId: "user-2" });

    expect(res.status).toBe(201);
    expect(res.body.discovered).toBe(false);
    expect(res.body.message).toMatch(/Traffic recorded for known app: slack/);
  });

  it("accumulates authTypes and userCount across multiple records for the same app", async () => {
    await request(app).post("/api/traffic").send(VALID_RECORD);
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, authType: "saml", userId: "user-2" });

    const res = await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, authType: "none", userId: "user-3" });

    expect(res.body.app.identityPosture.authTypesUsed).toEqual(
      expect.arrayContaining(["oauth", "saml", "none"])
    );
    expect(res.body.app.identityPosture.hasUnauthenticated).toBe(true);
    expect(res.body.app.identityPosture.riskLevel).toBe("high");
    expect(res.body.app.userCount).toBe(3);
  });

  it("returns 400 with field-level errors for an invalid payload", async () => {
    const res = await request(app).post("/api/traffic").send({
      sourceIp: "not-an-ip",
      destinationApp: "",
      authType: "jwt",
      userId: "",
      timestamp: "not-a-date",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toMatchObject({
      sourceIp: expect.any(Array),
      destinationApp: expect.any(Array),
      authType: expect.any(Array),
      userId: expect.any(Array),
      timestamp: expect.any(Array),
    });
  });

  it("rejects out-of-range octets that the old digit-count regex accepted", async () => {
    const invalidIps = ["256.0.0.1", "999.999.999.999", "192.168.1.300", "0.0.0.256"];

    for (const sourceIp of invalidIps) {
      const res = await request(app)
        .post("/api/traffic")
        .send({ ...VALID_RECORD, sourceIp });

      expect(res.status).toBe(400);
      expect(res.body.details.sourceIp).toBeDefined();
    }
  });

  it("accepts all valid IPv4 boundary values", async () => {
    const validIps = ["0.0.0.0", "255.255.255.255", "192.168.1.1", "10.0.0.1"];

    for (const sourceIp of validIps) {
      const res = await request(app)
        .post("/api/traffic")
        .send({ ...VALID_RECORD, sourceIp });

      expect(res.status).toBe(201);
    }
  });

  it("returns 400 when body is missing entirely", async () => {
    const res = await request(app)
      .post("/api/traffic")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

// ---------------------------------------------------------------------------
// GET /api/apps
// ---------------------------------------------------------------------------
describe("GET /api/apps", () => {
  beforeEach(async () => {
    await request(app).post("/api/traffic").send(VALID_RECORD);
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, destinationApp: "notion", authType: "basic" });
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, destinationApp: "github", authType: "saml" });
  });

  it("returns all discovered apps with identity posture and id", async () => {
    const res = await request(app).get("/api/apps");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.apps).toHaveLength(3);

    const slack = res.body.apps.find((a: any) => a.name === "slack");
    expect(slack.id).toBeDefined();
    expect(slack.identityPosture).toMatchObject({
      authTypesUsed: ["oauth"],
      hasUnauthenticated: false,
      riskLevel: "low",
    });
  });

  it("flags apps with 'none' auth as high risk", async () => {
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, destinationApp: "risky-app", authType: "none" });

    const res = await request(app).get("/api/apps");
    const risky = res.body.apps.find((a: any) => a.name === "risky-app");

    expect(risky.identityPosture.hasUnauthenticated).toBe(true);
    expect(risky.identityPosture.riskLevel).toBe("high");
  });

  it("flags basic-only apps as medium risk", async () => {
    const res = await request(app).get("/api/apps");
    const notion = res.body.apps.find((a: any) => a.name === "notion");

    expect(notion.identityPosture.riskLevel).toBe("medium");
    expect(notion.identityPosture.hasUnauthenticated).toBe(false);
  });

  it("returns pagination metadata with defaults (page=1, limit=20)", async () => {
    const res = await request(app).get("/api/apps");

    expect(res.body).toMatchObject({
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
  });

  it("paginates correctly — page 1 of 2 with limit=2", async () => {
    const res = await request(app).get("/api/apps?page=1&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.apps).toHaveLength(2);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it("paginates correctly — page 2 of 2 with limit=2", async () => {
    const res = await request(app).get("/api/apps?page=2&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.apps).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it("returns empty apps array when page is beyond total", async () => {
    const res = await request(app).get("/api/apps?page=99&limit=20");

    expect(res.status).toBe(200);
    expect(res.body.apps).toHaveLength(0);
  });

  it("returns 400 for limit exceeding the maximum of 100", async () => {
    const res = await request(app).get("/api/apps?limit=999");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
  });

  it("returns 400 for page=0", async () => {
    const res = await request(app).get("/api/apps?page=0");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
  });

  it("does not move app lastSeen backwards when an out-of-order event arrives", async () => {
    const laterTimestamp = "2026-07-01T12:00:00.000Z";
    const earlierTimestamp = "2025-01-01T00:00:00.000Z";

    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, timestamp: laterTimestamp });

    // Out-of-order: older timestamp arrives after the newer one
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, timestamp: earlierTimestamp });

    const res = await request(app).get("/api/apps/lookup?name=slack");
    expect(res.body.app.lastSeen).toBe(laterTimestamp);
  });
});

// ---------------------------------------------------------------------------
// GET /api/apps/lookup?name=
// ---------------------------------------------------------------------------
describe("GET /api/apps/lookup", () => {
  beforeEach(async () => {
    await request(app).post("/api/traffic").send(VALID_RECORD);
  });

  it("returns a single app profile by name with id", async () => {
    const res = await request(app).get("/api/apps/lookup?name=slack");

    expect(res.status).toBe(200);
    expect(res.body.app.name).toBe("slack");
    expect(res.body.app.id).toBeDefined();
    expect(res.body.app.identityPosture).toBeDefined();
  });

  it("returns 404 for an unknown app name", async () => {
    const res = await request(app).get("/api/apps/lookup?name=does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/does-not-exist/);
  });

  it("returns 400 when name query param is missing", async () => {
    const res = await request(app).get("/api/apps/lookup");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Query parameter 'name' is required");
  });

  it("returns 400 when name query param is empty", async () => {
    const res = await request(app).get("/api/apps/lookup?name=");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Query parameter 'name' is required");
  });
});

// ---------------------------------------------------------------------------
// GET /api/traffic
// ---------------------------------------------------------------------------
describe("GET /api/traffic", () => {
  beforeEach(async () => {
    await request(app).post("/api/traffic").send(VALID_RECORD);
    await request(app).post("/api/traffic").send({ ...VALID_RECORD, destinationApp: "notion" });
    await request(app).post("/api/traffic").send({ ...VALID_RECORD, destinationApp: "github" });
  });

  it("returns records with pagination metadata (defaults)", async () => {
    const res = await request(app).get("/api/traffic");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 3, totalPages: 1 });
    expect(res.body.records).toHaveLength(3);
  });

  it("paginates correctly — page 1 of 2 with limit=2", async () => {
    const res = await request(app).get("/api/traffic?page=1&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(2);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it("paginates correctly — page 2 of 2 with limit=2", async () => {
    const res = await request(app).get("/api/traffic?page=2&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it("returns empty records when page is beyond total", async () => {
    const res = await request(app).get("/api/traffic?page=99");

    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([]);
  });

  it("returns empty records when nothing has been ingested", async () => {
    const emptyApp = createApp();
    const res = await request(emptyApp).get("/api/traffic");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, totalPages: 0, records: [] });
  });

  it("returns 400 for invalid pagination params", async () => {
    const res = await request(app).get("/api/traffic?page=0");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
  });
});

// ---------------------------------------------------------------------------
// GET /api/stats
// ---------------------------------------------------------------------------
describe("GET /api/stats", () => {
  it("reflects correct counts after ingestion", async () => {
    await request(app).post("/api/traffic").send(VALID_RECORD);
    await request(app).post("/api/traffic").send({ ...VALID_RECORD, userId: "user-2" });
    await request(app).post("/api/traffic").send({ ...VALID_RECORD, destinationApp: "notion" });

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalTrafficRecords: 3, totalDiscoveredApps: 2 });
  });

  it("returns zeros when the store is empty", async () => {
    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalTrafficRecords: 0, totalDiscoveredApps: 0 });
  });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// ---------------------------------------------------------------------------
// GET /api/apps/:id/users
// ---------------------------------------------------------------------------
describe("GET /api/apps/:id/users", () => {
  let appId: string;

  beforeEach(async () => {
    const first = await request(app).post("/api/traffic").send(VALID_RECORD);
    appId = first.body.app.id;

    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, userId: "user-2", authType: "saml" });

    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, destinationApp: "notion", userId: "user-3", authType: "basic" });
  });

  it("returns users with pagination metadata (defaults)", async () => {
    const res = await request(app).get(`/api/apps/${appId}/users`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(res.body.users).toHaveLength(2);
  });

  it("returns each user with userId, firstSeen, lastSeen, authTypesUsed", async () => {
    const res = await request(app).get(`/api/apps/${appId}/users`);

    const u1 = res.body.users.find((u: any) => u.userId === "user-1");
    expect(u1).toMatchObject({ userId: "user-1", authTypesUsed: ["oauth"] });
    expect(u1.firstSeen).toBeDefined();
    expect(u1.lastSeen).toBeDefined();
  });

  it("tracks auth types per user individually", async () => {
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, userId: "user-1", authType: "none" });

    const res = await request(app).get(`/api/apps/${appId}/users`);
    const u1 = res.body.users.find((u: any) => u.userId === "user-1");

    expect(u1.authTypesUsed).toEqual(expect.arrayContaining(["oauth", "none"]));
  });

  it("does not include users from other apps", async () => {
    const res = await request(app).get(`/api/apps/${appId}/users`);
    const userIds = res.body.users.map((u: any) => u.userId);

    expect(userIds).not.toContain("user-3");
  });

  it("updates lastSeen when the same user accesses the app again", async () => {
    const laterTimestamp = "2026-07-01T12:00:00.000Z";
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, userId: "user-1", timestamp: laterTimestamp });

    const res = await request(app).get(`/api/apps/${appId}/users`);
    const u1 = res.body.users.find((u: any) => u.userId === "user-1");

    expect(u1.lastSeen).toBe(laterTimestamp);
    expect(u1.firstSeen).toBe(VALID_RECORD.timestamp);
  });

  it("does not move lastSeen backwards when an out-of-order event arrives (user level)", async () => {
    const laterTimestamp = "2026-07-01T12:00:00.000Z";
    const earlierTimestamp = "2025-01-01T00:00:00.000Z";

    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, userId: "user-1", timestamp: laterTimestamp });

    // Out-of-order: older timestamp arrives after the newer one
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, userId: "user-1", timestamp: earlierTimestamp });

    const res = await request(app).get(`/api/apps/${appId}/users`);
    const u1 = res.body.users.find((u: any) => u.userId === "user-1");

    expect(u1.lastSeen).toBe(laterTimestamp);
  });

  it("paginates correctly — page 1 of 2 with limit=1", async () => {
    const res = await request(app).get(`/api/apps/${appId}/users?page=1&limit=1`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it("paginates correctly — page 2 of 2 with limit=1", async () => {
    const res = await request(app).get(`/api/apps/${appId}/users?page=2&limit=1`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
  });

  it("returns 400 for invalid pagination params", async () => {
    const res = await request(app).get(`/api/apps/${appId}/users?limit=0`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
  });

  it("returns 404 for an unknown app id", async () => {
    const res = await request(app).get(
      "/api/apps/00000000-0000-0000-0000-000000000000/users"
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/00000000-0000-0000-0000-000000000000/);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — POST /api/traffic
// ---------------------------------------------------------------------------
describe("Rate limiting on POST /api/traffic", () => {
  it("returns 429 after 100 requests in the same 1-second window from the same sourceIp", async () => {
    const requests = Array.from({ length: 100 }, () =>
      request(app).post("/api/traffic").send(VALID_RECORD)
    );
    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);

    expect(statuses.every((s) => s === 201)).toBe(true);

    const over = await request(app).post("/api/traffic").send(VALID_RECORD);
    expect(over.status).toBe(429);
    expect(over.body.error).toBe("Too many requests");
  });

  it("allows requests from a different sourceIp when one IP is rate-limited", async () => {
    const requests = Array.from({ length: 100 }, () =>
      request(app).post("/api/traffic").send(VALID_RECORD)
    );
    await Promise.all(requests);

    const blocked = await request(app).post("/api/traffic").send(VALID_RECORD);
    expect(blocked.status).toBe(429);

    const allowed = await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, sourceIp: "10.0.0.99" });
    expect(allowed.status).toBe(201);
  });

  it("includes rate limit headers in the response", async () => {
    const res = await request(app).post("/api/traffic").send(VALID_RECORD);

    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Unknown routes
// ---------------------------------------------------------------------------
describe("Unknown routes", () => {
  it("returns 404 for unregistered paths", async () => {
    const res = await request(app).get("/api/unknown-path");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Route not found");
  });
});

// ---------------------------------------------------------------------------
// Global error handler — service throws unexpectedly
// ---------------------------------------------------------------------------
describe("Global error handler", () => {
  it("returns 500 with consistent { error } shape when service throws", async () => {
    const throwingService = { ingest: () => { throw new Error("boom"); } } as any;
    const controller = new TrafficController(throwingService);
    const router = createTrafficRouter(controller, createTrafficRateLimit(new MemoryStore()));

    const faultyApp = express();
    faultyApp.use(express.json());
    faultyApp.use("/api", router);
    faultyApp.use((_req: any, res: any) =>
      res.status(404).json({ error: "Route not found" })
    );
    faultyApp.use((err: Error, _req: any, res: any, _next: any) =>
      res.status(500).json({ error: "Internal server error" })
    );

    const res = await request(faultyApp).post("/api/traffic").send(VALID_RECORD);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });
});
