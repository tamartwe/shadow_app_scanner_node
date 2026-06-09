import { z } from "zod";

export const TrafficRecordSchema = z.object({
  sourceIp: z
    .string()
    .min(1, "sourceIp is required")
    .regex(
      /^(\d{1,3}\.){3}\d{1,3}$/,
      "sourceIp must be a valid IPv4 address"
    ),
  destinationApp: z.string().min(1, "destinationApp is required").trim(),
  authType: z.enum(["none", "basic", "oauth", "saml"], {
    error: "authType must be one of: none, basic, oauth, saml",
  }),
  userId: z.string().min(1, "userId is required").trim(),
  timestamp: z
    .string()
    .datetime({ message: "timestamp must be a valid ISO 8601 datetime" }),
});

export type TrafficRecordInput = z.infer<typeof TrafficRecordSchema>;
