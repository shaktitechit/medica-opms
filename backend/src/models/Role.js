/**
 * @fileoverview ESM mongoose mirror for Role (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/Role
 */
import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },

    department: {
      type: String,
      enum: ["super_admin", "admin", "sales", "finance", "account", "dispatch"],
      required: true,
    },

    permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],

    is_system_role: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Role", roleSchema);