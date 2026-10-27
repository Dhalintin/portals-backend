import rateLimit from "express-rate-limit";
export const invitationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 100,
  keyGenerator: req => req.auth!.userId,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many invitation requests. Try again later." } },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // login / register / forgot-password
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many attempts. Try again later.",
    },
  },
});

// Refreshing ordinary sessions must not exhaust the stricter login/reset
// attempt budget for everyone sharing a school's public IP address.
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many refresh attempts. Try again shortly." },
  },
});

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests." },
  },
});

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // Paystack can retry
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // authenticated general API
  standardHeaders: true,
  legacyHeaders: false,
});

// import rateLimit from "express-rate-limit";
// import RedisStore from "rate-limit-redis";
// import { redis } from "../lib/redis";

// function createRedisStore(prefix: string) {
//   return new RedisStore({
//     // @ts-expect-error – ioredis sendCommand typing
//     sendCommand: (...args: string[]) => redis.call(...args),
//     prefix: `rl:${prefix}:`, // keeps keys namespaced
//   });
// }

// const commonMessage = {
//   success: false,
//   error: {
//     code: "RATE_LIMITED",
//     message: "Too many requests. Please try again later.",
//   },
// };

// /** Strict – login / register / forgot-password */
// export const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 20,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: commonMessage,
//   store: createRedisStore("auth"),
// });

// /** Mild – public brand / directory */
// export const publicLimiter = rateLimit({
//   windowMs: 60 * 1000, // 1 minute
//   max: 60,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: commonMessage,
//   store: createRedisStore("public"),
// });

// /** Webhook – Paystack retries */
// export const webhookLimiter = rateLimit({
//   windowMs: 60 * 1000,
//   max: 120,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: commonMessage,
//   store: createRedisStore("webhook"),
// });

// /** General authenticated API */
// export const apiLimiter = rateLimit({
//   windowMs: 60 * 1000,
//   max: 300,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: commonMessage,
//   store: createRedisStore("api"),
// });

export const parentPaymentLimiter = rateLimit({windowMs:60*1000,max:20,keyGenerator:req=>req.auth!.userId,standardHeaders:true,legacyHeaders:false,message:{success:false,error:{code:"RATE_LIMITED",message:"Too many payment requests. Wait a moment and check your payment status before trying again."}}});
