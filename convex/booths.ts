import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const BOOTH_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const getBooth = query({
  args: { boothId: v.string() },
  handler: async (ctx, args) => {
    const normId = args.boothId.toUpperCase().trim();
    const booth = await ctx.db
      .query("booths")
      .withIndex("by_boothId", (q) => q.eq("boothId", normId))
      .first();
    return booth;
  },
});

export const createBooth = mutation({
  args: {
    boothId: v.string(),
    outputMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normId = args.boothId.toUpperCase().trim();
    const now = Date.now();
    const existing = await ctx.db
      .query("booths")
      .withIndex("by_boothId", (q) => q.eq("boothId", normId))
      .first();

    if (!existing) {
      await ctx.db.insert("booths", {
        boothId: normId,
        hostClientId: "", // Unclaimed, will be claimed by first real visitor
        status: "waiting",
        outputMode: args.outputMode || "strip",
        updatedAt: now,
        expiresAt: now + BOOTH_TTL_MS,
      });
    }
    return { boothId: normId };
  },
});

export const joinBooth = mutation({
  args: {
    boothId: v.string(),
    clientId: v.string(),
    outputMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normId = args.boothId.toUpperCase().trim();
    const now = Date.now();
    let booth = await ctx.db
      .query("booths")
      .withIndex("by_boothId", (q) => q.eq("boothId", normId))
      .first();

    if (!booth) {
      // First person to join is the Host
      await ctx.db.insert("booths", {
        boothId: normId,
        hostClientId: args.clientId,
        status: "waiting",
        outputMode: args.outputMode || "strip",
        updatedAt: now,
        expiresAt: now + BOOTH_TTL_MS,
      });

      return {
        role: "host",
        isInitiator: true,
        peers: [],
        status: "waiting",
        boothId: normId,
      };
    }

    // If booth was created without a host or host was empty/system_creator, claim it as Host!
    if (!booth.hostClientId || booth.hostClientId === "" || booth.hostClientId.startsWith("system_creator")) {
      await ctx.db.patch(booth._id, {
        hostClientId: args.clientId,
        status: "waiting",
        updatedAt: now,
      });
      return {
        role: "host",
        isInitiator: true,
        peers: [],
        status: "waiting",
        boothId: normId,
      };
    }

    // Host reconnecting
    if (booth.hostClientId === args.clientId) {
      const peers = booth.guestClientId ? [booth.guestClientId] : [];
      return {
        role: "host",
        isInitiator: true,
        peers,
        status: booth.status,
        boothId: normId,
      };
    }

    if (booth.guestClientId === args.clientId) {
      // Guest reconnecting
      return {
        role: "guest",
        isInitiator: false,
        peers: [booth.hostClientId],
        status: booth.status,
        boothId: normId,
      };
    }

    if (!booth.guestClientId) {
      // Slot for guest is open! Guest joins now.
      await ctx.db.patch(booth._id, {
        guestClientId: args.clientId,
        status: "connected",
        updatedAt: now,
      });

      // Broadcast 'peer-joined' signal to host
      await ctx.db.insert("signals", {
        boothId: normId,
        fromClientId: args.clientId,
        toClientId: booth.hostClientId,
        type: "peer-joined",
        data: { peerId: args.clientId },
        timestamp: now,
      });

      return {
        role: "guest",
        isInitiator: false,
        peers: [booth.hostClientId],
        status: "connected",
        boothId: normId,
      };
    }

    // Both host and guest slots are taken by different clients
    return {
      full: true,
      boothId: normId,
    };
  },
});

export const leaveBooth = mutation({
  args: {
    boothId: v.string(),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const normId = args.boothId.toUpperCase().trim();
    const now = Date.now();
    const booth = await ctx.db
      .query("booths")
      .withIndex("by_boothId", (q) => q.eq("boothId", normId))
      .first();

    if (!booth) return;

    if (booth.guestClientId === args.clientId) {
      await ctx.db.patch(booth._id, {
        guestClientId: undefined,
        status: "waiting",
        updatedAt: now,
      });

      await ctx.db.insert("signals", {
        boothId: normId,
        fromClientId: args.clientId,
        toClientId: booth.hostClientId,
        type: "peer-left",
        data: { peerId: args.clientId, reason: "disconnect" },
        timestamp: now,
      });
    } else if (booth.hostClientId === args.clientId && booth.guestClientId) {
      await ctx.db.insert("signals", {
        boothId: normId,
        fromClientId: args.clientId,
        toClientId: booth.guestClientId,
        type: "peer-left",
        data: { peerId: args.clientId, reason: "host_left" },
        timestamp: now,
      });
    }
  },
});

export const updateBoothState = mutation({
  args: {
    boothId: v.string(),
    state: v.object({
      outputMode: v.optional(v.string()),
      stripStyle: v.optional(v.string()),
      template: v.optional(v.any()),
      cardLayout: v.optional(v.string()),
      photoCount: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const normId = args.boothId.toUpperCase().trim();
    const booth = await ctx.db
      .query("booths")
      .withIndex("by_boothId", (q) => q.eq("boothId", normId))
      .first();

    if (booth) {
      await ctx.db.patch(booth._id, {
        ...args.state,
        updatedAt: Date.now(),
      });
    }
  },
});

export const sendSignal = mutation({
  args: {
    boothId: v.string(),
    fromClientId: v.string(),
    type: v.string(),
    data: v.optional(v.any()),
    toClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normId = args.boothId.toUpperCase().trim();
    const now = Date.now();

    // Broadcast relay event types mapping
    const broadcastEvents: Record<string, string> = {
      "retake": "on-retake",
      "retake-triggered": "on-retake",
      "style-switch": "on-style-switch",
      "style-switched": "on-style-switch",
      "filter-switch": "on-filter-switch",
      "filter-switched": "on-filter-switch",
      "zoom-switch": "on-zoom-switch",
      "zoom-switched": "on-zoom-switch",
      "template-sync": "on-template-sync",
      "booth-output": "booth-output",
      "ic-customizing": "ic-customizing",
      "retake-peer-stay": "retake-peer-stay",
      "retake-peer-ready": "retake-peer-ready",
    };

    let signalType = args.type;
    let signalData = args.data || {};

    if (broadcastEvents[args.type]) {
      signalType = broadcastEvents[args.type];
    }

    if (args.type === "template-sync" && args.data?.template) {
      const booth = await ctx.db
        .query("booths")
        .withIndex("by_boothId", (q) => q.eq("boothId", normId))
        .first();
      if (booth) {
        await ctx.db.patch(booth._id, {
          template: args.data.template,
          photoCount: args.data.template.slotsCount || booth.photoCount,
          updatedAt: now,
        });
      }
    }

    if (args.type === "capture-triggered") {
      signalType = "start-capture";
      const photoCount =
        args.data &&
        Number.isFinite(args.data.photoCount) &&
        args.data.photoCount >= 1 &&
        args.data.photoCount <= 8
          ? Math.floor(args.data.photoCount)
          : 3;

      const startAt = now + 500;
      const intervalMs = 4000;
      const shutterTimes: number[] = [];
      for (let i = 0; i < photoCount; i++) {
        shutterTimes.push(startAt + 3500 + i * intervalMs);
      }
      const revealAt = shutterTimes[shutterTimes.length - 1] + 2500;

      signalData = {
        startAt,
        shutterTimes,
        revealAt,
        photoCount,
      };
    }

    await ctx.db.insert("signals", {
      boothId: normId,
      fromClientId: args.fromClientId,
      toClientId: args.toClientId,
      type: signalType,
      data: signalData,
      timestamp: now,
    });
  },
});

export const getSignals = query({
  args: {
    boothId: v.string(),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const normId = args.boothId.toUpperCase().trim();
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_boothId_and_time", (q) =>
        q.eq("boothId", normId).gt("timestamp", args.since)
      )
      .order("asc")
      .take(50);
    return signals;
  },
});

// Storage mutations for snapshots/photos
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveTempImage = mutation({
  args: {
    imageId: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    boothId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tempImages", {
      imageId: args.imageId.toLowerCase(),
      storageId: args.storageId,
      contentType: args.contentType,
      boothId: args.boothId,
      expiresAt: Date.now() + BOOTH_TTL_MS,
    });
  },
});

export const getTempImageUrl = query({
  args: { imageId: v.string() },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("tempImages")
      .withIndex("by_imageId", (q) => q.eq("imageId", args.imageId.toLowerCase()))
      .first();
    if (!item) return null;
    return await ctx.storage.getUrl(item.storageId);
  },
});
