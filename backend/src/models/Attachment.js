/**
 * @fileoverview ESM mongoose mirror for Attachment (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/Attachment
 */
import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    original_name: { type: String, required: true },
    file_name: { type: String, required: true },

    mime_type: { type: String, required: true },
    size: { type: Number, required: true },

    storage_provider: {
      type: String,
      enum: ["local", "s3", "minio"],
      default: "local",
    },

    bucket: String,
    key: String,
    url: String,

    entity_type: {
      type: String,
      enum: [
        "order",
        "dispatch",
        "transport",
        "customer",
        "driver",
        "vehicle",
      ],
      required: true,
    },

    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    uploaded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Attachment", attachmentSchema);