/**
 * @fileoverview ESM mongoose mirror for User (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/User
 */
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },

    department: {
      type: String,
      enum: ["super_admin", "admin", "sales", "finance", "dispatch"],
      required: true,
    },

    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],

    is_active: { type: Boolean, default: true },
    last_login_at: Date,
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);