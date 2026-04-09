"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare2,
  FileText,
  FolderOpen,
  Bell,
  MessageSquare,
  Phone,
  Map,
  BarChart3,
  LineChart,
  Search,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalNavItem } from "@/lib/portal-context";

const ICON_MAP: Record<string, LucideIcon> = {
  "/dashboard":    LayoutDashboard,
  "/tasks":        CheckSquare2,
  "/edms":         FileText,
  "/files":        FolderOpen,
  "/notifications": Bell,
  "/chat":         MessageSquare,
  "/calls":        Phone,
  "/gis":          Map,
  "/analytics":    BarChart3,
  "/reporting":    LineChart,
  "/search":       Search,
  "/admin":        Settings2,
};

type Props = {
  items: PortalNavItem[];
};

export function SidebarNav({ items }: Props) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((item) => {
        const Icon = ICON_MAP[item.href] ?? LayoutDashboard;
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
