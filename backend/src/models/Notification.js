/**
 * @fileoverview ESM mongoose mirror for Notification (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/Notification
 */
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true },
    message: { type: String, required: true },

    type: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
    },

    module: {
      type: String,
      enum: [
        "order",
        "finance",
        "dispatch",
        "transport",
        "flag",
        "system",
      ],
      default: "system",
    },

    entity_type: String,
    entity_id: mongoose.Schema.Types.ObjectId,

    is_read: { type: Boolean, default: false },
    read_at: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);