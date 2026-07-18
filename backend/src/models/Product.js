/**
 * @fileoverview Product master schema for OPMS commercial engine
 * @module models/Product
 */

import mongoose from "mongoose";

const PRODUCT_UNIT_ENUM = [
  "pcs",
  "box",
  "kg",
  "ltr",
  "meter",
  "set",
  "kit",
  "bottle",
];

const productSchema = new mongoose.Schema(
  {
    /* -------------------------------------------------------
     * BASIC INFO
     * ----------------------------------------------------- */

    product_name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    generic_name: {
      type: String,
      trim: true,
    },

    /**
     * Alternative searchable names
     * Example:
     * ["EX150", "Exide 150Ah", "Battery 150"]
     */
    aliases: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    sku: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    /* -------------------------------------------------------
     * GROUPING
     * ----------------------------------------------------- */

    /**
     * Commercial grouping
     * Example:
     * Battery
     * Solar Panel
     * UPS
     * Inverter
     */
    product_group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductGroup",
      index: true,
    },

    /**
     * Optional subgroup
     * Example:
     * Tubular Battery
     * Lithium Battery
     */
    product_subgroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductSubgroup",
      index: true,
    },

    /**
     * Brand name
     */
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductBrand",
      index: true,
    },

    /**
     * Manufacturer name
     */
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductManufacturer",
      index: true,
    },

    /* -------------------------------------------------------
     * COMMERCIAL
     * ----------------------------------------------------- */

    unit: {
      type: String,
      enum: PRODUCT_UNIT_ENUM,
      default: "pcs",
    },

    /**
     * Fallback/default rate
     */
    base_price: {
      type: Number,
      required: true,
      min: 0,
    },

    /**
     * Approval threshold
     */
    minimum_sale_rate: {
      type: Number,
      required: true,
      min: 0,
    },

    /**
     * Compliance/reference price
     */
    mrp: {
      type: Number,
      min: 0,
    },

    gst_percent: {
      type: Number,
      default: 18,
      min: 0,
      max: 100,
    },

    warranty_months: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* -------------------------------------------------------
     * META
     * ----------------------------------------------------- */

    description: {
      type: String,
      trim: true,
    },

    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    searchable_text: {
      type: String,
      select: false,
    },

    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * Highlighted / featured product for catalogs and dashboards
     */
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
  },
);

/* -------------------------------------------------------
 * TEXT SEARCH
 * ----------------------------------------------------- */

productSchema.index({
  product_name: "text",
  generic_name: "text",
  aliases: "text",
  sku: "text",
  brand: "text",
  manufacturer: "text",
  product_group: "text",
});

/* -------------------------------------------------------
 * FILTER INDEXES
 * ----------------------------------------------------- */

productSchema.index({
  product_group: 1,
  product_subgroup: 1,
});

productSchema.index({
  brand: 1,
  manufacturer: 1,
});

productSchema.index({
  is_active: 1,
  deletedAt: 1,
});

productSchema.index({
  is_featured: 1,
  is_active: 1,
});

/* -------------------------------------------------------
 * EXPORT
 * ----------------------------------------------------- */

export default mongoose.models.Product ||
  mongoose.model("Product", productSchema);
