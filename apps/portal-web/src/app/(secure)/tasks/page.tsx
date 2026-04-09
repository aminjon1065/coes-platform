import Link from "next/link";
import { getTasksData } from "@/lib/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatDate(value: string | null) {
  if (!value) return "No deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
}

function createQuery(status?: string, priority?: string, isOverdue?: boolean) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  if (isOverdue !== undefined) params.set("isOverdue", String(isOverdue));
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

type TasksPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : undefined;
  const priority = typeof params.priority === "string" ? params.priority : undefined;
  const isOverdue =
    typeof params.isOverdue === "string" ? params.isOverdue === "true" : undefined;

  const tasks = await getTasksData({
    status,
    priority,
    isOverdue,
    limit: 20,
    offset: 0,
  });

  const activeFilters = [
    status ? `status:${status}` : null,
    priority ? `priority:${priority}` : null,
    isOverdue ? "overdue" : null,
  ].filter(Boolean) as string[];

  const quickFilters = [
    { label: "All", href: createQuery() },
    { label: "Overdue", href: createQuery(undefined, undefined, true) },
    { label: "In progress", href: createQuery("in_progress") },
    { label: "High priority", href: createQuery(undefined, "high") },
    { label: "Completed", href: createQuery("completed") },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Tasks</Badge>
            <div className="space-y-3">
              <CardTitle className="font-display text-4xl leading-tight">
                My tasks
              </CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Read-only task list migrated into the portal BFF. Showing {tasks.total} visible
                items for the current filter set.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {quickFilters.map((filter) => (
              <Button asChild key={filter.label} variant="secondary">
                <Link href={filter.href}>{filter.label}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(13,27,47,0.94),rgba(19,46,78,0.9))] text-white">
          <CardHeader>
            <CardDescription className="text-white/60">Filter summary</CardDescription>
            <CardTitle className="font-display text-3xl text-white">
              {tasks.items.length} task{tasks.items.length === 1 ? "" : "s"} loaded
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeFilters.length === 0 ? (
              <p className="text-sm leading-6 text-white/70">
                No explicit filters. The list shows the default portal workload view.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeFilters.map((filter) => (
                  <Badge className="border-white/10 bg-white/10 text-white" key={filter}>
                    {filter}
                  </Badge>
                ))}
              </div>
            )}
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4 text-sm leading-6 text-white/70">
              Use the quick filters to pivot between overdue items, execution state, and
              priority-sensitive workload without changing the data source.
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display text-2xl">Visible task list</CardTitle>
              <CardDescription>
                Current operator queue from the task service.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {tasks.items.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No tasks found.
                </li>
              ) : (
                tasks.items.map((task) => (
                  <li
                    className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between"
                    key={task.id}
                  >
                    <div className="space-y-2">
                      <Link className="font-semibold text-foreground" href={`/tasks/${task.id}`}>
                        {task.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(task.dueAt)} · {task.priority}
                        {task.isOverdue ? " · overdue" : ""}
                      </p>
                    </div>
                    <Badge variant={task.isOverdue ? "destructive" : "secondary"}>
                      {task.status}
                    </Badge>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
