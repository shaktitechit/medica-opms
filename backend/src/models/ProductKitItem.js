 * @fileoverview Kit bill-of-materials: one kit product contains many individual items.
 * Each item carries a percentage share of the kit.
 * @module models/ProductKitItem
 */

import mongoose from "mongoose";

/**
 * One line in a kit — an individual product + its percentage of the kit.
 * Quantity is optional.
 */
const kitComponentSchema = new mongoose.Schema(
  {
    individual: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    percentage: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 1000,
    },

    /**
     * Optional unit count of this individual within the kit
     */
    quantity: {
      type: Number,
      min: 0,
      default: null,
    },

    sort_order: {
      type: Number,
      default: 0,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    remarks: {
      type: String,
      trim: true,
    },
  },
  { _id: true },
);

/**
 * One document per kit. `items` holds every individual product in that kit.
 */
const productKitItemSchema = new mongoose.Schema(
  {
    /**
     * Parent kit product (`product_type: "kit"`)
     */
    kit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      unique: true,
      index: true,
    },

    /**
     * Multiple individual products that make up this kit
     */
    items: {
      type: [kitComponentSchema],
      default: [],
      validate: {
        validator(items) {
          if (!Array.isArray(items) || items.length === 0) return true;
          const ids = items.map((i) => String(i.individual));
          return ids.length === new Set(ids).size;
        },
        message: "Duplicate individual products are not allowed in the same kit",
      },
    },

    is_active: {
      type: Boolean,
      default: true,
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
    collection: "product_kit_items",
  },
);

productKitItemSchema.index({
  kit: 1,
  is_active: 1,
  deletedAt: 1,
});

productKitItemSchema.index({ "items.individual": 1 });

/* -------------------------------------------------------
 * EXPORT
 * ----------------------------------------------------- */

export default mongoose.models.ProductKitItem ||
  mongoose.model("ProductKitItem", productKitItemSchema);
