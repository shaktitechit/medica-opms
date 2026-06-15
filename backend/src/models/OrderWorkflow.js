/**
 * @fileoverview Immutable workflow history
 */

import mongoose from "mongoose";

const orderWorkflowSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    action_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: [
        "sales",
        "admin",
        "finance",
        "account",
        "dispatch",
      ],
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: [
        "drafted",
        "submitted",

        "approved",
        "partially_approved",
        "fully_approved",
        "partially_finance_approved",
        "fully_finance_approved",
        "partially_account_approved",
        "fully_account_approved",

        "review_requested",

        "sent_to_sales",
        "sent_to_admin",
        "sent_to_finance",
        "sent_to_account",
        "sent_to_dispatch",

        "hold",
        "released",

        "rejected",
        "cancelled",

        "allocation_started",
        "allocation_completed",

        "partial_dispatch",
        "full_dispatch",

        "partially_transported",
        "fully_transported",
        "transporter_assigned",

        "vehicle_assigned",

        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",

        "delivery_failed",
        "returned",

        "reopened",
        "completed",
        "closed",
      ],
      required: true,
      index: true,
    },

    from_stage: String,

    to_stage: String,

    from_status: String,

    to_status: String,

    reason_code: String,

    remarks: String,

    internal_notes: String,

    revision_number: {
      type: Number,
      default: 1,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },

    ip_address: String,

    user_agent: String,

    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  },
);

orderWorkflowSchema.index({
  order: 1,
  created_at: -1,
});

export default mongoose.model(
  "OrderWorkflow",
  orderWorkflowSchema,
);
