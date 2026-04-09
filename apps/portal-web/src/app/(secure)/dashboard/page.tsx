import Link from "next/link";
import {
  CheckSquare2,
  AlertCircle,
  FileStack,
  Bell,
  ArrowRight,
  Users,
  ShieldCheck,
  Activity,
  MapPin,
  TriangleAlert,
  Wrench,
  MoveUpRight,
} from "lucide-react";
import { getSearchHealth, listAdminUsers, listRoles } from "@/lib/admin";
import { getDashboardData } from "@/lib/dashboard";
import { getGisSummaryData } from "@/lib/gis";
import { getPortalContext, hasWorkspace } from "@/lib/portal-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ── Status badge helper ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s.includes("done") || s.includes("complete") || s.includes("closed") || s.includes("ready"))
    return <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">{status}</Badge>;
  if (s.includes("overdue") || s.includes("failed") || s.includes("rejected"))
    return <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">{status}</Badge>;
  if (s.includes("review") || s.includes("pending") || s.includes("workflow"))
    return <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">{status}</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

// ── Priority badge ─────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const p = priority.toLowerCase();
  if (p === "critical" || p === "high")
    return <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">{priority}</Badge>;
  if (p === "medium")
    return <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">{priority}</Badge>;
  return <Badge variant="secondary">{priority}</Badge>;
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  description,
  href,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  description: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription className="text-sm font-medium">{label}</CardDescription>
          <Icon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const portalContext = await getPortalContext();
  const dashboard = await getDashboardData();
  const showAdminWorkspace = hasWorkspace(portalContext, "admin");
  const showAnalyticsWorkspace = hasWorkspace(portalContext, "analytics");

  const [adminUsers, adminRoles, searchHealth, gisSummary] = await Promise.all([
    showAdminWorkspace ? listAdminUsers() : Promise.resolve(null),
    showAdminWorkspace ? listRoles() : Promise.resolve(null),
    showAdminWorkspace ? getSearchHealth() : Promise.resolve(null),
    showAnalyticsWorkspace ? getGisSummaryData() : Promise.resolve(null),
  ]);

  const analyticsCapabilityCount = portalContext.capabilities.filter(
    (c) => c.startsWith("gis.") || c.startsWith("search.") || c.startsWith("analytics."),
  ).length;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {dashboard.user.displayName}
        </p>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="My Tasks"
          value={dashboard.stats.taskCount}
          description="Active items in your workload"
          href="/tasks"
          icon={CheckSquare2}
        />
        <StatCard
          label="Overdue Tasks"
          value={dashboard.stats.overdueTaskCount}
          description="Require immediate attention"
          href="/tasks?isOverdue=true"
          icon={AlertCircle}
        />
        <StatCard
          label="Docs in Workflow"
          value={dashboard.stats.documentsInWorkflow}
          description="Pending approval or review"
          href="/edms?status=in_workflow"
          icon={FileStack}
        />
        <StatCard
          label="Unread Alerts"
          value={dashboard.stats.unreadNotifications}
          description="Items in your notification inbox"
          href="/notifications"
          icon={Bell}
        />
      </div>

      {/* ── Tasks + Documents ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>My Tasks</CardTitle>
              <CardDescription>Your current active queue</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <Link href="/tasks">
                View all
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            {dashboard.tasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No tasks in your queue.
              </p>
            ) : (
              <div className="flex flex-col">
                {dashboard.tasks.map((task, i) => (
                  <div key={task.id}>
                    {i > 0 && <Separator />}
                    <div className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {task.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {task.dueAt ? `Due ${task.dueAt}` : "No deadline"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge status={task.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Documents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Documents</CardTitle>
              <CardDescription>Latest EDMS workflow activity</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <Link href="/edms">
                View all
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            {dashboard.documents.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No recent documents.
              </p>
            ) : (
              <div className="flex flex-col">
                {dashboard.documents.map((doc, i) => (
                  <div key={doc.id}>
                    {i > 0 && <Separator />}
                    <div className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/edms/${doc.id}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {doc.registrationNumber
                            ? `${doc.registrationNumber} · ${doc.title}`
                            : doc.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {doc.direction} · updated {doc.updatedAt}
                        </p>
                      </div>
                      <StatusBadge status={doc.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Notifications ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Unread Notifications</CardTitle>
            <CardDescription>Inbox items awaiting acknowledgement</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <Link href="/notifications">
              View all
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          {dashboard.notifications.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No unread notifications.
            </p>
          ) : (
            <div className="flex flex-col">
              {dashboard.notifications.map((notification, i) => (
                <div key={notification.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={notification.href ?? "/notifications"}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {notification.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notification.body ?? "No body"} · {notification.createdAt}
                      </p>
                    </div>
                    <PriorityBadge priority={notification.priority} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Admin workspace ─────────────────────────────────────── */}
      {showAdminWorkspace && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
                <ShieldCheck className="size-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Admin</CardTitle>
                <CardDescription>Platform control surface</CardDescription>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">
                Open admin
                <MoveUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <div className="grid divide-x divide-border sm:grid-cols-3">
              <Link
                href="/admin/users"
                className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-3.5" />
                  Users
                </div>
                <span className="text-2xl font-bold">{adminUsers?.total ?? 0}</span>
                <span className="text-xs text-muted-foreground">
                  Operator accounts
                </span>
              </Link>
              <Link
                href="/admin/roles"
                className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="size-3.5" />
                  Roles
                </div>
                <span className="text-2xl font-bold">{adminRoles?.length ?? 0}</span>
                <span className="text-xs text-muted-foreground">
                  Defined capability roles
                </span>
              </Link>
              <Link
                href="/admin"
                className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="size-3.5" />
                  Monitoring
                </div>
                <span className="text-2xl font-bold">
                  {searchHealth?.ready ? "Ready" : "Review"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Search system status
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Analytics workspace ─────────────────────────────────── */}
      {showAnalyticsWorkspace && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
                <MapPin className="size-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle>Analytics</CardTitle>
                <CardDescription>GIS, incidents, and analytical tooling</CardDescription>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/analytics">
                Open analytics
                <MoveUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <div className="grid divide-x divide-border sm:grid-cols-3">
              <Link
                href="/gis"
                className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" />
                  Open Incidents
                </div>
                <span className="text-2xl font-bold">{gisSummary?.openIncidents ?? 0}</span>
                <span className="text-xs text-muted-foreground">
                  Live GIS incidents
                </span>
              </Link>
              <Link
                href="/gis"
                className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="size-3.5" />
                  High Severity
                </div>
                <span className="text-2xl font-bold">
                  {gisSummary?.highSeverityIncidents ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">
                  Critical and high priority
                </span>
              </Link>
              <Link
                href="/search"
                className="flex flex-col gap-1 p-6 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wrench className="size-3.5" />
                  Capabilities
                </div>
                <span className="text-2xl font-bold">{analyticsCapabilityCount}</span>
                <span className="text-xs text-muted-foreground">
                  Analytical tools available
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
