/**
 * @fileoverview Order due sheet — stores the document attached to an order.
 * @module models/OrderDueSheet
 */

import mongoose from "mongoose";

const orderDueSheetSchema = new mongoose.Schema(
  {
    due_sheet_no: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attachment",
      required: true,
    },

    sheet_date: {
      type: Date,
      default: Date.now,
    },

    revision_number: {
      type: Number,
      default: 1,
      min: 1,
    },

    is_current: {
      type: Boolean,
      default: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "superseded", "archived"],
      default: "active",
      index: true,
    },

    remarks: String,

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

orderDueSheetSchema.index({ order: 1, is_current: 1 });

export const OrderDueSheet = mongoose.model("OrderDueSheet", orderDueSheetSchema);

export default OrderDueSheet;
