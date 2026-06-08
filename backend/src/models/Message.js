/**
 * @fileoverview ESM mongoose mirror for Message (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/Message
 */
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    recipient: { type: String, required: true, index: true },
    channel: { type: String, enum: ['email', 'whatsapp'], required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'queued', 'sending', 'sent', 'failed'],
      default: 'pending',
      index: true,
    },
    subject: { type: String },
    body: { type: String },
    templateName: { type: String },
    templateParams: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
    attempts: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed },
    sentAt: { type: Date },
    failedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
