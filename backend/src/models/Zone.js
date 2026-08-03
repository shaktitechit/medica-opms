/**
 * @fileoverview Zone Model
 * @module models/Zone
 */

import mongoose from "mongoose";

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    parties: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Party",
      },
    ],
    sales_persons: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Zone ||
  mongoose.model("Zone", zoneSchema);
