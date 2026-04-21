import { beforeEach, describe, expect, it, vi } from "vitest";

const trackingDbMocks = vi.hoisted(() => ({
  createTrackingEvent: vi.fn(),
  getAllActiveTrackings: vi.fn(),
  isTrackingRenewalDue: vi.fn(),
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

const cassandraMocks = vi.hoisted(() => ({
  getUserHistorySince: vi.fn(),
}));

const mockSql = vi.hoisted(() => vi.fn(async (strings: TemplateStringsArray) => {
  const text = strings.join(" ");
  if (text.includes("pg_try_advisory_lock")) {
    return [{ locked: true }];
  }
  return [];
}));

vi.mock("./db", () => ({
  sql: mockSql,
}));

vi.mock("./db/tracking", () => ({
  createTrackingEvent: trackingDbMocks.createTrackingEvent,
  getAllActiveTrackings: trackingDbMocks.getAllActiveTrackings,
  isTrackingRenewalDue: trackingDbMocks.isTrackingRenewalDue,
  pauseTracking: trackingDbMocks.pauseTracking,
  touchTrackingCheck: trackingDbMocks.touchTrackingCheck,
  updateTrackingSnapshot: trackingDbMocks.updateTrackingSnapshot,
}));

vi.mock("./db/notifications", () => notificationMocks);

vi.mock("./trackingSupport", () => trackingSupportMocks);

vi.mock("./tg-queries/queries", () => ({
  getUserHistorySince: cassandraMocks.getUserHistorySince,
}));

const { runTrackingMonitorCycle } = await import("./trackingMonitor");

const baseTracking = {
  id: "b06a7fc5-f485-45e0-8cba-1c88dd5672d6",
  user_id: "user-1",
  profile_user_id: "tg-42",
  profile_username: "alice",
  profile_display_name: "Alice",
  status: "active" as const,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  last_renewal_at: new Date("2026-01-15T00:00:00.000Z"),
  cost_per_month: 1,
  observed_profile: {
    username: "alice_old",
    display_name: "Alice",
    bio: "builder",
    profile_photo: "https://cdn.example.com/a-old.png",
    phone: "***0000",
    premium_status: false,
  },
  last_checked_at: null,
  last_detected_change_at: null,
  last_history_check_at: new Date("2026-01-01T00:00:00.000Z"),
};

describe("trackingMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects changes from user_history table and creates tracking events", async () => {
    trackingDbMocks.getAllActiveTrackings.mockResolvedValueOnce([baseTracking]);
    trackingDbMocks.isTrackingRenewalDue.mockReturnValue(false);
    cassandraMocks.getUserHistorySince.mockResolvedValueOnce([
      {
        field: "username",
        old_value: "alice_old",
        new_value: "alice",
        changed_at: new Date("2026-01-05T12:00:00.000Z"),
      },
    ]);
    trackingSupportMocks.loadObservedProfileForUser.mockResolvedValue({
      user: {},
      profileUsername: "alice",
      profileDisplayName: "Alice",
      observedProfile: {
        username: "alice",
        display_name: "Alice",
        bio: "builder",
        profile_photo: "https://cdn.example.com/a-old.png",
        phone: "***0000",
        premium_status: false,
      },
    });

    await runTrackingMonitorCycle();

    expect(cassandraMocks.getUserHistorySince).toHaveBeenCalledWith(
      "tg-42",
      expect.any(Date)
    );
    expect(trackingDbMocks.createTrackingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingId: baseTracking.id,
        fieldName: "username",
        oldValue: "alice_old",
        newValue: "alice",
      })
    );
    expect(notificationMocks.createUsernameChangeNotification).toHaveBeenCalledWith(
      baseTracking.user_id,
      baseTracking.profile_user_id,
      "alice",
      "alice_old",
      "alice"
    );
    expect(trackingDbMocks.updateTrackingSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingId: baseTracking.id,
        detectedChange: true,
        observedProfile: expect.objectContaining({
          username: "alice",
        }),
      })
    );
  });

  it("skips snapshot update when user_history returns empty", async () => {
    trackingDbMocks.getAllActiveTrackings.mockResolvedValueOnce([baseTracking]);
    trackingDbMocks.isTrackingRenewalDue.mockReturnValue(false);
    cassandraMocks.getUserHistorySince.mockResolvedValueOnce([]);
    trackingSupportMocks.loadObservedProfileForUser.mockResolvedValue({
      user: {},
      profileUsername: "alice",
      profileDisplayName: "Alice",
      observedProfile: {
        username: "alice_old",
        display_name: "Alice",
        bio: "builder",
        profile_photo: "https://cdn.example.com/a-old.png",
        phone: "***0000",
        premium_status: false,
      },
    });

    await runTrackingMonitorCycle();

    expect(trackingDbMocks.createTrackingEvent).not.toHaveBeenCalled();
    expect(notificationMocks.createUsernameChangeNotification).not.toHaveBeenCalled();
    expect(trackingDbMocks.updateTrackingSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingId: baseTracking.id,
        detectedChange: false,
      })
    );
  });

  it("falls back to snapshot comparison when user_history query fails", async () => {
    trackingDbMocks.getAllActiveTrackings.mockResolvedValueOnce([baseTracking]);
    trackingDbMocks.isTrackingRenewalDue.mockReturnValue(false);
    cassandraMocks.getUserHistorySince.mockRejectedValueOnce(new Error("Cassandra connection failed"));
    trackingSupportMocks.loadObservedProfileForUser.mockResolvedValue({
      user: {},
      profileUsername: "alice",
      profileDisplayName: "Alice",
      observedProfile: {
        username: "alice",
        display_name: "Alice",
        bio: "builder",
        profile_photo: "https://cdn.example.com/a-old.png",
        phone: "***0000",
        premium_status: false,
      },
    });

    await runTrackingMonitorCycle();

    expect(trackingDbMocks.createTrackingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldName: "username",
        oldValue: "alice_old",
        newValue: "alice",
      })
    );
    expect(notificationMocks.createUsernameChangeNotification).toHaveBeenCalled();
  });

  it("pauses a tracking when renewal is due and credits are unavailable", async () => {
    trackingDbMocks.getAllActiveTrackings.mockResolvedValue([baseTracking]);
    trackingDbMocks.isTrackingRenewalDue.mockReturnValue(true);
    trackingSupportMocks.chargeTrackingCredits.mockResolvedValue(null);

    await runTrackingMonitorCycle();

    expect(trackingDbMocks.pauseTracking).toHaveBeenCalledWith(baseTracking.id);
    expect(notificationMocks.createTrackingExpiredNotification).toHaveBeenCalledWith(
      baseTracking.user_id,
      baseTracking.profile_username,
      "Add credits to resume monitoring. Tracking will auto-renew when credits are available."
    );
    expect(trackingDbMocks.createTrackingEvent).not.toHaveBeenCalled();
  });
});
