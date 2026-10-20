import { describe, expect, it } from "vitest";
import { markPlatformNotificationsRead, platformNotificationDemoData, type PlatformNotification } from "./platform-notification-demo-data";

describe("Platform notification read state", () => {
  it.each(["in_attesa", "approvata", "rifiutata", "annullata"] as const)("reading does not change a %s request", (status) => {
    const original: PlatformNotification = {
      id: "test", category: "requests", title: "test", body: "test",
      createdAt: "2026-10-20T05:30:00Z", destination: "/piattaforma/richieste-vendo",
      read: false, linkedRequest: { status },
    };
    const result = markPlatformNotificationsRead([original], ["test"]);
    expect(result[0]?.read).toBe(true);
    expect(result[0]?.linkedRequest?.status).toBe(status);
    expect(original.read).toBe(false);
  });
  it("reading one preserves other unread notifications", () => {
    const result = markPlatformNotificationsRead(platformNotificationDemoData, ["demo-new-request"]);
    expect(result.filter((item) => !item.read).map((item) => item.id)).toEqual(["demo-cancelled-request"]);
  });
  it("reading all moves notifications to history without deleting items", () => {
    const result = markPlatformNotificationsRead(platformNotificationDemoData, platformNotificationDemoData.map((item) => item.id));
    expect(result.filter((item) => !item.read)).toHaveLength(0);
    expect(result).toHaveLength(4);
    expect(result.map((item) => item.linkedRequest?.status)).toEqual(["in_attesa", "annullata", "approvata", "rifiutata"]);
  });
});