import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  booths: defineTable({
    boothId: v.string(),
    hostClientId: v.string(),
    guestClientId: v.optional(v.string()),
    status: v.string(), // "waiting" | "connected" | "finished"
    outputMode: v.optional(v.string()),
    stripStyle: v.optional(v.string()),
    template: v.optional(v.any()),
    cardLayout: v.optional(v.string()),
    photoCount: v.optional(v.number()),
    updatedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_boothId", ["boothId"]),

  signals: defineTable({
    boothId: v.string(),
    fromClientId: v.string(),
    toClientId: v.optional(v.string()),
    type: v.string(),
    data: v.optional(v.any()),
    timestamp: v.number(),
  }).index("by_boothId_and_time", ["boothId", "timestamp"]),

  tempImages: defineTable({
    imageId: v.string(),
    boothId: v.optional(v.string()),
    storageId: v.id("_storage"),
    contentType: v.string(),
    expiresAt: v.number(),
  }).index("by_imageId", ["imageId"]),
});
