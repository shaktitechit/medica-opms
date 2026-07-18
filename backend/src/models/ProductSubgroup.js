/**
 * @fileoverview Product Subgroup Model
 * @module models/ProductSubgroup
 */

import mongoose from "mongoose";

const productSubgroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductGroup",
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    is_featured: {
      type: Boolean,
      default: false,
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

// Compound index to ensure subgroup names are unique within a group
productSubgroupSchema.index({ name: 1, group: 1 }, { unique: true });

export default mongoose.models.ProductSubgroup ||
  mongoose.model("ProductSubgroup", productSubgroupSchema);
