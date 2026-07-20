/**
 * @fileoverview ESM mongoose mirror for TransportPlanOrder (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/TransportPlanOrder
 */

import mongoose from "mongoose";

const TRANSPORT_PLAN_ORDER_STATUSES = [
  "pending",
  "packed",
  "dispatched",
  "delivered",
  "cancelled",
];

const transportPlanOrderSchema = new mongoose.Schema(
  {
    transport_plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportPlan",
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },
    /** Partial dispatch batch — required for open-order / multi-dispatch planning. */
    dispatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderDispatch",
      required: true,
    },
    dispatch_date: Date,
    lr_number: { type: String, trim: true },
    invoice_number: { type: String, trim: true },
    packages: { type: Number, min: 0 },
    weight: { type: Number, min: 0 },
    status: {
      type: String,
      enum: TRANSPORT_PLAN_ORDER_STATUSES,
      default: "pending",
      index: true,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

transportPlanOrderSchema.index(
  { transport_plan: 1, dispatch: 1 },
  {
    name: "transport_plan_1_dispatch_1_unique",
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      dispatch: { $type: "objectId" },
    },
  }
);

/** One active transport-plan line per OrderDispatch (orders may still have multiple dispatches). */
transportPlanOrderSchema.index(
  { dispatch: 1 },
  {
    name: "dispatch_1_active_unique",
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      dispatch: { $type: "objectId" },
      status: { $in: ["pending", "packed", "dispatched"] },
    },
  }
);

export default mongoose.models.TransportPlanOrder ||
  mongoose.model("TransportPlanOrder", transportPlanOrderSchema);
