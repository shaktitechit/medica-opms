/**
 * @fileoverview ESM mongoose model for TermsAndConditions
 * @module models/TermsAndConditions
 */
import mongoose from "mongoose";

const termsAndConditionsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, index: true },
    code: { type: String, trim: true, lowercase: true },
    type: { type: String, enum: ["quotation", "order", "invoice", "general"], default: "general", index: true },
    description: { type: String, trim: true },
    is_active: { type: Boolean, default: true, index: true },
    is_default: { type: Boolean, default: false, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.TermsAndConditions || mongoose.model("TermsAndConditions", termsAndConditionsSchema);
