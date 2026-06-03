/**
 * @fileoverview Maps products allowed for parties/customers
 * @module models/PartyProductMapping
 */

import mongoose from "mongoose";

const partyProductMappingSchema = new mongoose.Schema(
  {
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

    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    is_orderable: {
      type: Boolean,
      default: true,
    },

    priority: {
      type: Number,
      default: 100,
    },

    remarks: {
      type: String,
      trim: true,
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
  {
    timestamps: true,
  },
);

/* -------------------------------------------------------
 * UNIQUE CONSTRAINT
 * ----------------------------------------------------- */

partyProductMappingSchema.index(
  {
    party: 1,
    product: 1,
  },
  {
    unique: true,
  },
);

/* -------------------------------------------------------
 * EXPORT
 * ----------------------------------------------------- */

export default mongoose.models.PartyProductMapping ||
  mongoose.model("PartyProductMapping", partyProductMappingSchema);
