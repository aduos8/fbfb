import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackingRouter } from "./tracking";

const trackingDbMocks = vi.hoisted(() => ({
  cancelTracking: vi.fn(),
  createTracking: vi.fn(),
  getActiveTrackings: vi.fn(),
  getPausedTrackings: vi.fn(),
  getTrackingById: vi.fn(),
  getTrackingByProfile: vi.fn(),
  getTrackingEventsForUser: vi.fn(),
}));

const trackingSupportMocks = vi.hoisted(() => ({
  chargeTrackingCredits: vi.fn(),
  loadObservedProfileForUser: vi.fn(),
}));

vi.mock("../../lib/db/tracking", () => ({
  cancelTracking: trackingDbMocks.cancelTracking,
  createTracking: trackingDbMocks.createTracking,
  getActiveTrackings: trackingDbMocks.getActiveTrackings,
  getNextRenewalAt: (value: Date | string) => {
    const base = value instanceof Date ? value : new Date(value);
    return new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
  },
  getPausedTrackings: trackingDbMocks.getPausedTrackings,
  getTrackingById: trackingDbMocks.getTrackingById,
  getTrackingByProfile: trackingDbMocks.getTrackingByProfile,
  getTrackingEventsForUser: trackingDbMocks.getTrackingEventsForUser,
}));

vi.mock("../../lib/trackingSupport", () => ({
  chargeTrackingCredits: trackingSupportMocks.chargeTrackingCredits,
  loadObservedProfileForUser: trackingSupportMocks.loadObservedProfileForUser,
}));

const baseObservedProfile = {
  username: "alice",
  display_name: "Alice",
  bio: "builder",
  profile_photo: "https://cdn.example.com/alice.png",
  phone: "***0000",
  premium_status: true,
};

const baseTrackingRecord = {
  id: "31bda447-9d39-4b81-9171-c7d818a802ca",
  user_id: "user-1",
  profile_user_id: "tg-42",
  profile_username: "alice",
  profile_display_name: "Alice",
  status: "active" as const,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  last_renewal_at: new Date("2026-01-15T00:00:00.000Z"),
  cost_per_month: 1,
  observed_profile: baseObservedProfile,
  last_checked_at: new Date("2026-01-15T01:00:00.000Z"),
  last_detected_change_at: new Date("2026-01-16T00:00:00.000Z"),
  last_history_check_at: new Date("2026-01-15T01:00:00.000Z"),
};

describe("trackingRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts tracking using the observed Cassandra snapshot and charges exactly once", async () => {
    trackingDbMocks.getTrackingByProfile.mockResolvedValue(null);
    trackingSupportMocks.loadObservedProfileForUser.mockResolvedValue({
      profileUsername: "alice",
      profileDisplayName: "Alice",
      observedProfile: baseObservedProfile,
    });
    trackingSupportMocks.chargeTrackingCredits.mockResolvedValue(4);
    trackingDbMocks.createTracking.mockResolvedValue(baseTrackingRecord);

    const caller = trackingRouter.createCaller({ userId: "user-1", userRole: "user" as const });
    const result = await caller.startTracking({ profileUserId: "tg-42" });

    expect(trackingSupportMocks.chargeTrackingCredits).toHaveBeenCalledTimes(1);
    expect(trackingSupportMocks.chargeTrackingCredits).toHaveBeenCalledWith({
      userId: "user-1",
      type: "tracking_start",
      reference: "tracking:tg-42",
      notes: "Tracking start: tg-42",
    });
    expect(trackingDbMocks.createTracking).toHaveBeenCalledWith(
      "user-1",
      "tg-42",
      "alice",
      "Alice",
      baseObservedProfile
    );
    expect(result.tracking.profile_user_id).toBe("tg-42");
    expect(result.tracking.next_renewal_at).toBeDefined();
  });

  it("returns paused trackings for the caller", async () => {
    const pausedRecord = { ...baseTrackingRecord, id: "31bda447-9d39-4b81-9171-c7d818a802cb", status: "paused" as const };
    trackingDbMocks.getPausedTrackings.mockResolvedValue([pausedRecord]);

    const caller = trackingRouter.createCaller({ userId: "user-1", userRole: "user" as const });
    const result = await caller.getPausedTrackings();

    expect(trackingDbMocks.getPausedTrackings).toHaveBeenCalledWith("user-1");
    expect(result.trackings).toHaveLength(1);
    expect(result.trackings[0].status).toBe("paused");
  });

  it("returns serialized history events for the caller's tracking", async () => {
    trackingDbMocks.getTrackingById.mockResolvedValue(baseTrackingRecord);
    trackingDbMocks.getTrackingEventsForUser.mockResolvedValue([
      {
        id: "5b44c165-6448-4d85-a54f-67f52a84df72",
        tracking_id: baseTrackingRecord.id,
        user_id: "user-1",
        profile_user_id: "tg-42",
        profile_username: "alice",
        field_name: "username",
        old_value: "old_alice",
        new_value: "alice",
        created_at: new Date("2026-01-20T00:00:00.000Z"),
      },
    ]);

    const caller = trackingRouter.createCaller({ userId: "user-1", userRole: "user" as const });
    const result = await caller.history({ trackingId: baseTrackingRecord.id, limit: 10 });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      tracking_id: baseTrackingRecord.id,
      field_name: "username",
      old_value: "old_alice",
      new_value: "alice",
    });
  });
});
