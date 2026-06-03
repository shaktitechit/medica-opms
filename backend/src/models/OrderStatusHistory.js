/**
 * @fileoverview ESM mongoose mirror for OrderStatusHistory (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/OrderStatusHistory
 */
import mongoose from "mongoose";

const orderStatusHistorySchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },

    from_status: String,
    to_status: { type: String, required: true },

    changed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    remarks: String,
  },
  { timestamps: true }
);

export default mongoose.model("OrderStatusHistory", orderStatusHistorySchema);