import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield, LogOut, User } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getPortalContext, getPortalNavItems } from "@/lib/portal-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarNav } from "@/components/sidebar-nav";

export const dynamic = "force-dynamic";

const fallbackPortalContext = {
  roles: [],
  capabilities: [],
  workspaces: [
    {
      key: "core" as const,
      label: "Core Workspace",
      description: "Tasks, EDMS, files, notifications, chat, and shared operational tools.",
    },
  ],
};

export default async function SecureLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let sessionUser;

  try {
    sessionUser = await getSessionUser();
  } catch {
    redirect("/login");
  }

  if (!sessionUser) {
    redirect("/login");
  }

  const portalContext = await getPortalContext().catch(() => fallbackPortalContext);
  const navItems = getPortalNavItems(portalContext);

  const initials = sessionUser.displayName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        {/* Brand */}
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary">
            <Shield className="size-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold tracking-tight">CoES Portal</span>
        </div>

        {/* Navigation */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          <SidebarNav items={navItems} />
        </div>

        <Separator />

        {/* User section */}
        <div className="p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {initials || <User className="size-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-none">
                {sessionUser.displayName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clearance {sessionUser.clearanceLevel}
              </p>
            </div>
          </div>

          <form action="/api/auth/logout" method="post" className="mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              type="submit"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 lg:hidden">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary">
            <Shield className="size-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold">CoES Portal</span>
          <div className="ml-auto">
            <form action="/api/auth/logout" method="post">
              <Button variant="ghost" size="icon" type="submit">
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
