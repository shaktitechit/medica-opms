/**
 * @fileoverview ESM mongoose mirror for ActivityLog (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/ActivityLog
 */
import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    entity_type: {
      type: String,
      required: true,
      enum: [
        "user",
        "customer",
        "product",
        "order",
        "approval",
        "flag",
        "dispatch",
        "transport",
        "vehicle",
        "driver",
        "attachment",
        "product_group",
        "product_subgroup",
        "product_brand",
        "product_manufacturer",
      ],
    },

    entity_id: { type: mongoose.Schema.Types.ObjectId, required: true },

    action: {
      type: String,
      required: true,
      enum: [
        "created",
        "updated",
        "deleted",
        "submitted",
        "approved",
        "rejected",
        "assigned",
        "status_changed",
        "flagged",
        "resolved",
        "uploaded",
        "generated",
        "cancelled",
      ],
    },

    message: { type: String, required: true },

    old_value: mongoose.Schema.Types.Mixed,
    new_value: mongoose.Schema.Types.Mixed,

    ip_address: String,
    user_agent: String,
  },
  { timestamps: true }
);

export default mongoose.model("ActivityLog", activityLogSchema);