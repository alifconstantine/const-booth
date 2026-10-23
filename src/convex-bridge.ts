
import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

if (typeof window !== "undefined") {
  (window as any).ConvexClient = ConvexClient;
  (window as any).convexApi = api;
}
