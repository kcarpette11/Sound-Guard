import { Type } from "@google/genai";

export const verificationResponseSchema = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: ["smoke_alarm", "door_knock", "baby_cry", "car_horn", "siren", "other"],
    },
    verified: { type: Type.BOOLEAN },
    severity: {
      type: Type.STRING,
      enum: ["low", "medium", "high", "critical"],
    },
    message: { type: Type.STRING },
  },
  required: ["category", "verified", "severity", "message"],
};

export interface VerificationResponse {
  category: "smoke_alarm" | "door_knock" | "baby_cry" | "car_horn" | "siren" | "other";
  verified: boolean;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}
