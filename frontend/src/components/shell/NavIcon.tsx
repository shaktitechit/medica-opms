"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlarmClock,
  AlertCircle,
  AlertTriangle,
  Archive,
  BadgeCheck,
  BellRing,
  Boxes,
  Building2,
  CalendarDays,
  Car,
  ClipboardCheck,
  ClipboardList,
  CloudUpload,
  Columns2,
  CreditCard,
  FileBarChart,
  FileEdit,
  FilePlus,
  FileText,
  Flag,
  FolderOpen,
  GanttChart,
  Inbox,
  Landmark,
  LayoutDashboard,
  MapPin,
  MessageSquareWarning,
  Package,
  PackageOpen,
  Percent,
  PhoneForwarded,
  PiggyBank,
  Send,
  ShieldBan,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  UserRound,
  Wallet,
} from "lucide-react";

/**
 * Exhaustive lucide registry for sidebar nav (`portalNav` icon strings).
 */
export const NAV_ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  AlarmClock,
  AlertCircle,
  AlertTriangle,
  Archive,
  BadgeCheck,
  BellRing,
  Boxes,
  Building2,
  CalendarDays,
  Car,
  ClipboardCheck,
  ClipboardList,
  CloudUpload,
  Columns2,
  CreditCard,
  FileBarChart,
  FileEdit,
  FilePlus,
  FileText,
  Flag,
  FolderOpen,
  GanttChart,
  Inbox,
  Landmark,
  LayoutDashboard,
  MapPin,
  MessageSquareWarning,
  Package,
  PackageOpen,
  Percent,
  PhoneForwarded,
  PiggyBank,
  Send,
  ShieldBan,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  UserSquare: UserRound,
  Wallet,
};

const FallbackIcon = LayoutDashboard;

type NavIconProps = {
  name?: string | null;
  className?: string;
  strokeWidth?: number;
};

export function NavIcon({
  name,
  className = "size-[18px] shrink-0",
  strokeWidth = 2,
}: NavIconProps) {
  const k = typeof name === "string" ? name.trim() : "";
  const key =
    k && Object.prototype.hasOwnProperty.call(NAV_ICON_MAP, k) ? k : null;
  const Icon = key ? NAV_ICON_MAP[key]! : FallbackIcon;
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}
