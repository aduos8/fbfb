import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const reserved = vi.fn() as any;
  Object.assign(reserved, {
    release: vi.fn(),
  });

  const sql = Object.assign(vi.fn(), {
    reserve: vi.fn(async () => reserved),
  });

  return { reserved, sql };
});

const trackingDbMocks = vi.hoisted(() => ({
  createTrackingEvent: vi.fn(),
  getAllActiveTrackings: vi.fn(),
  isTrackingRenewalDue: vi.fn(),
  normalizeObservedProfile: vi.fn((value) => value),
  pauseTracking: vi.fn(),
  touchTrackingCheck: vi.fn(),
  updateTrackingSnapshot: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  createBioUpdateNotification: vi.fn(),
  createDisplayNameChangeNotification: vi.fn(),
  createPhoneChangeNotification: vi.fn(),
  createPremiumStatusChangeNotification: vi.fn(),
  createProfilePhotoChangeNotification: vi.fn(),
  createTrackingExpiredNotification: vi.fn(),
  createTrackingRenewalNotification: vi.fn(),
  createUsernameChangeNotification: vi.fn(),
}));

const trackingSupportMocks = vi.hoisted(() => ({
  chargeTrackingCredits: vi.fn(),
  loadObservedProfileForUser: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  getUserHistorySince: vi.fn(),
}));

vi.mock("./db", () => ({
  sql: dbMocks.sql,
}));

vi.mock("./db/tracking", () => trackingDbMocks);
vi.mock("./db/notifications", () => notificationMocks);
vi.mock("./trackingSupport", () => trackingSupportMocks);
vi.mock("./tg-queries/queries", () => queryMocks);

const { runTrackingMonitorCycle } = await import("./trackingMonitor");

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.sql.mockResolvedValue([]);
  dbMocks.reserved.mockResolvedValue([{ locked: true }]);
  trackingDbMocks.getAllActiveTrackings.mockResolvedValue([]);
});

describe("runTrackingMonitorCycle", () => {
  it("holds the advisory lock on a reserved Postgres connection and releases it on the same session", async () => {
    const ran = await runTrackingMonitorCycle();

    expect(ran).toBe(true);
    expect(dbMocks.sql.reserve).toHaveBeenCalledTimes(1);
    expect(dbMocks.reserved).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      4_004_001
    );
    expect(dbMocks.reserved).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      4_004_001
    );
    expect(dbMocks.reserved.release).toHaveBeenCalledTimes(1);
  });
});
