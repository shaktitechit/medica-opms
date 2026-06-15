/**
 * @fileoverview ESM mongoose mirror for OrderAmmendmentUser (canonical schemas live in data/mongoRegistry).
 * @module models/OrderAmmendmentUser
 */
import mongoose from "mongoose";

const orderAmmendmentUserSchema = new mongoose.Schema(
  {
    order_approval: { type: mongoose.Schema.Types.ObjectId, ref: "OrderApproval", required: true, index: true },
    department: {
      type: String,
      enum: ["admin", "finance", "account"],
      required: true,
      index: true,
    },
    ammended_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ammended_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("OrderAmmendmentUser", orderAmmendmentUserSchema);
