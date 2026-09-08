/**
 * @fileoverview ESM mongoose model for TermsText (Multiple TermsText linked to one TermsAndConditions)
 * @module models/TermsText
 */
import mongoose from "mongoose";

const termsTextSchema = new mongoose.Schema(
  {
    terms_and_conditions_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TermsAndConditions",
      required: true,
      index: true,
    },
    text: { type: String, required: true, trim: true },
    sequence: { type: Number, default: 1 },
    is_active: { type: Boolean, default: true, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.TermsText || mongoose.model("TermsText", termsTextSchema);
