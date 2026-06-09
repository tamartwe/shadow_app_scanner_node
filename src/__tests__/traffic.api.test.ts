import request from "supertest";
import app from "../app";
import { trafficRepository } from "../repositories/traffic.repository";
import { appRepository } from "../repositories/app.repository";
import { rateLimitStore } from "../middleware/trafficRateLimit";

const VALID_RECORD = {
  sourceIp: "192.168.1.1",
  destinationApp: "slack",
  authType: "oauth",
  userId: "user-1",
  timestamp: "2026-06-01T10:00:00.000Z",
};

beforeEach(async () => {
  trafficRepository.clear();
  appRepository.clear();
  await rateLimitStore.resetAll();
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
});

// ---------------------------------------------------------------------------
// GET /api/apps/:name
// ---------------------------------------------------------------------------
describe("GET /api/apps/:name", () => {
  beforeEach(async () => {
    await request(app).post("/api/traffic").send(VALID_RECORD);
  });

  it("returns a single app profile by name with id", async () => {
    const res = await request(app).get("/api/apps/slack");

    expect(res.status).toBe(200);
    expect(res.body.app.name).toBe("slack");
    expect(res.body.app.id).toBeDefined();
    expect(res.body.app.identityPosture).toBeDefined();
  });

  it("returns 404 for an unknown app name", async () => {
    const res = await request(app).get("/api/apps/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/does-not-exist/);
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
    trafficRepository.clear();
    appRepository.clear();
    const res = await request(app).get("/api/traffic");

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
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, userId: "user-2" });
    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, destinationApp: "notion" });

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalTrafficRecords: 3,
      totalDiscoveredApps: 2,
    });
  });

  it("returns zeros when the store is empty", async () => {
    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalTrafficRecords: 0,
      totalDiscoveredApps: 0,
    });
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
    // Discover slack with user-1 (oauth) then user-2 (saml)
    const first = await request(app).post("/api/traffic").send(VALID_RECORD);
    appId = first.body.app.id;

    await request(app)
      .post("/api/traffic")
      .send({ ...VALID_RECORD, userId: "user-2", authType: "saml" });

    // A second app — user-3 only
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

  it("returns each user with userId, firstSeen, lastSeen, authTypesUsed", async () => {
    const res = await request(app).get(`/api/apps/${appId}/users`);

    const u1 = res.body.users.find((u: any) => u.userId === "user-1");
    expect(u1).toMatchObject({
      userId: "user-1",
      authTypesUsed: ["oauth"],
    });
    expect(u1.firstSeen).toBeDefined();
    expect(u1.lastSeen).toBeDefined();
  });

  it("tracks auth types per user individually", async () => {
    // user-1 accesses slack again with a different authType
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

    // All 100 within limit should succeed
    expect(statuses.every((s) => s === 201)).toBe(true);

    // 101st request from the same IP should be rejected
    const over = await request(app).post("/api/traffic").send(VALID_RECORD);
    expect(over.status).toBe(429);
    expect(over.body.error).toBe("Too many requests");
  });

  it("allows requests from a different sourceIp when one IP is rate-limited", async () => {
    const requests = Array.from({ length: 100 }, () =>
      request(app).post("/api/traffic").send(VALID_RECORD)
    );
    await Promise.all(requests);

    // Same IP → blocked
    const blocked = await request(app).post("/api/traffic").send(VALID_RECORD);
    expect(blocked.status).toBe(429);

    // Different sourceIp → allowed
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
