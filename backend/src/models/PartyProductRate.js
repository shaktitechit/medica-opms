/**
 * @fileoverview Party-specific product commercial pricing
 * @module models/PartyProductRate
 */

import mongoose from "mongoose";

const RATE_TYPE_ENUM = [
  "SR", // Standard Rate
  "SRA", // Special Rate Admin
  "CR", // Corporate Rate
];

const RATE_STATUS_ENUM = ["draft", "active", "expired", "cancelled"];

const partyProductRateSchema = new mongoose.Schema(
  {
    mapping: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartyProductMapping",
      required: true,
      index: true,
    },

    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    rate_type: {
      type: String,
      enum: RATE_TYPE_ENUM,
      required: true,
      index: true,
    },

    rate: {
      type: Number,
      required: true,
      min: 0,
    },

    min_qty: {
      type: Number,
      default: 1,
      min: 1,
    },

    max_qty: {
      type: Number,
      default: 999999,
    },

    validity_start: {
      type: Date,
      required: true,
      index: true,
    },

    validity_end: {
      type: Date,
      required: true,
      index: true,
    },

    priority: {
      type: Number,
      default: 100,
      index: true,
    },

    approval_required: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: RATE_STATUS_ENUM,
      default: "active",
      index: true,
    },

    remarks: {
      type: String,
      trim: true,
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approved_at: Date,

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

/* -------------------------------------------------------
 * INDEXES
 * ----------------------------------------------------- */

partyProductRateSchema.index({
  party: 1,
  product: 1,
  rate_type: 1,
  validity_start: -1,
});

partyProductRateSchema.index({
  validity_start: 1,
  validity_end: 1,
});

partyProductRateSchema.index({
  status: 1,
  rate_type: 1,
});

/* -------------------------------------------------------
 * EXPORT
 * ----------------------------------------------------- */

export default mongoose.models.PartyProductRate ||
  mongoose.model("PartyProductRate", partyProductRateSchema);
