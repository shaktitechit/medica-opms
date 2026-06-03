/**
 * @fileoverview ESM mongoose mirror for OrderFlag (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/OrderFlag
 */
import mongoose from "mongoose";

const orderFlagSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },

    flag_type: {
      type: String,
      enum: [
        "urgent",
        "dispatch_issue",
        "stock_issue",
        "customer_issue",
        "document_missing",
        "approval_delay",
        "vehicle_issue",
      ],
      required: true,
    },

    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    title: { type: String, required: true },
    description: String,

    blocks_order: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "dismissed"],
      default: "open",
      index: true,
    },

    department: {
      type: String,
      enum: ["sales", "finance", "dispatch"],
    },

    raised_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    due_date: Date,

    resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolved_at: Date,

    resolution_note: String,
  },
  { timestamps: true }
);

export default mongoose.model("OrderFlag", orderFlagSchema);