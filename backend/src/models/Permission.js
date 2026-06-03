/**
 * @fileoverview ESM mongoose mirror for Permission (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/Permission
 */
import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },

    module: {
      type: String,
      required: true,
      enum: [
        "user",
        "customer",
        "product",
        "order",
        "finance",
        "dispatch",
        "transport",
        "flag",
        "dashboard",
        "report",
      ],
    },

    description: String,
  },
  { timestamps: true }
);

export default mongoose.model("Permission", permissionSchema);