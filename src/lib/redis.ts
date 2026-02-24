import Redis from "ioredis";
import { config } from "../config.js";

// maxRetriesPerRequest: null est requis par BullMQ
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on("error", (err: Error) => {
  console.error("[Redis] Connection error:", err.message);
});
