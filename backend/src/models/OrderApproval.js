/**
 * @fileoverview ESM mongoose mirror for OrderApproval (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/OrderApproval
 */
import mongoose from "mongoose";

const orderApprovalSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },

    department: {
      type: String,
      enum: ["sales", "finance", "dispatch"],
      required: true,
    },

    approval_type: {
      type: String,
      enum: [
        "sales_approval",
        "finance_approval",
        "dispatch_approval",
        "transport_approval",
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approved_at: Date,

    rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejected_at: Date,

    remarks: String,
    rejection_reason: String,
  },
  { timestamps: true }
);

export default mongoose.model("OrderApproval", orderApprovalSchema);