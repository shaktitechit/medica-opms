/**
 * @fileoverview ESM mongoose mirror for PushSubscription (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/PushSubscription
 */
import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    expirationTime: { type: Number, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
