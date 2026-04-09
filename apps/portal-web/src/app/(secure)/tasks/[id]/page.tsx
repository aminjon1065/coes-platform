import Link from "next/link";
import { getTaskDetailData } from "@/lib/tasks";
import { addTaskCommentAction, transitionTaskAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB");
}

type TaskDetailPageProps = {
  params: Promise<{ id: string }>;
};

const TASK_TRANSITIONS: Record<string, string[]> = {
  draft: ["assigned", "cancelled"],
  assigned: ["accepted", "in_progress", "cannot_execute", "cancelled"],
  accepted: ["in_progress", "on_hold", "cannot_execute", "cancelled"],
  in_progress: ["completed", "on_hold", "cannot_execute", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: ["verified", "returned", "closed"],
  verified: ["closed"],
  returned: ["in_progress"],
  cannot_execute: ["in_progress", "assigned", "cancelled"],
  cancelled: ["closed"],
  closed: [],
};

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id } = await params;
  const task = await getTaskDetailData(id);
  const availableTransitions = TASK_TRANSITIONS[task.status] ?? [];

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/tasks">Tasks</Link> / {task.title}
      </nav>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <Badge className="w-fit">{task.status}</Badge>
                <CardTitle className="font-display text-4xl leading-tight">{task.title}</CardTitle>
                <CardDescription className="text-base">
                  Priority {task.priority} · due {formatDateTime(task.dueAt)}
                  {task.isOverdue ? " · overdue" : ""}
                </CardDescription>
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground">
                <span>Progress {task.progressPercent}%</span>
                <span>Updated {formatDateTime(task.updatedAt)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {task.description ? <p className="leading-7 text-foreground">{task.description}</p> : null}
            {task.progressNote ? (
              <div className="rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-muted-foreground">
                Latest progress note: {task.progressNote}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(13,27,47,0.94),rgba(19,46,78,0.9))] text-white">
          <CardHeader>
            <CardDescription className="text-white/60">Task metadata</CardDescription>
            <CardTitle className="font-display text-3xl text-white">
              {task.isOverdue ? "Requires attention" : "Execution context"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-white/70">
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Responsible position: {task.responsiblePositionId}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Assigning position: {task.assigningPositionId}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Created {formatDateTime(task.createdAt)}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Updated {formatDateTime(task.updatedAt)}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Actions</CardTitle>
            <CardDescription>Advance workflow state or update task progress.</CardDescription>
          </CardHeader>
          <CardContent>
            {availableTransitions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                No further transitions available from the current state.
              </p>
            ) : (
              <form action={transitionTaskAction} className="grid gap-4">
                <input name="taskId" type="hidden" value={task.id} />
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Target status
                  <select
                    className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                    defaultValue={availableTransitions[0]}
                    name="targetStatus"
                  >
                    {availableTransitions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Reason
                  <Textarea
                    name="reason"
                    placeholder="Required for on_hold, cannot_execute, cancelled, returned"
                    rows={3}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Completion report
                  <Textarea
                    name="completionReport"
                    placeholder="Required when completing a task"
                    rows={3}
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Progress %
                    <Input
                      defaultValue={task.progressPercent}
                      max="100"
                      min="0"
                      name="progressPercent"
                      type="number"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Progress note
                    <Input defaultValue={task.progressNote ?? ""} name="progressNote" type="text" />
                  </label>
                </div>
                <Button className="w-fit" type="submit">
                  Apply transition
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Comments</CardTitle>
            <CardDescription>Operational notes and internal discussion for this task.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form action={addTaskCommentAction} className="grid gap-4">
              <input name="taskId" type="hidden" value={task.id} />
              <label className="grid gap-2 text-sm font-medium text-foreground">
                New comment
                <Textarea
                  name="body"
                  placeholder="Add an operational comment"
                  rows={3}
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-foreground">
                <input className="size-4 accent-[var(--primary)]" name="isInternal" type="checkbox" />
                <span>Internal comment</span>
              </label>
              <Button className="w-fit" type="submit">
                Add comment
              </Button>
            </form>
            <ul className="space-y-3">
              {task.comments.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No comments.
                </li>
              ) : (
                task.comments.map((comment) => (
                  <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={comment.id}>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-foreground">{comment.authorLabel}</p>
                        <Badge variant={comment.isInternal ? "outline" : "secondary"}>
                          {comment.isInternal ? "internal" : "shared"}
                        </Badge>
                      </div>
                      <p className="leading-7 text-foreground">{comment.body}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(comment.createdAt)}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Subtasks</CardTitle>
            <CardDescription>Child work items linked to this task.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {task.subtasks.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No subtasks.
                </li>
              ) : (
                task.subtasks.map((subtask) => (
                  <li
                    className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between"
                    key={subtask.id}
                  >
                    <div className="space-y-2">
                      <Link className="font-semibold text-foreground" href={`/tasks/${subtask.id}`}>
                        {subtask.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {subtask.priority}
                        {subtask.isOverdue ? " · overdue" : ""}
                      </p>
                    </div>
                    <Badge variant={subtask.isOverdue ? "destructive" : "secondary"}>
                      {subtask.status}
                    </Badge>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Attachments</CardTitle>
            <CardDescription>Files and evidence linked to this task context.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {task.attachments.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No attachments.
                </li>
              ) : (
                task.attachments.map((attachment) => (
                  <li className="rounded-3xl border border-border/70 bg-white/70 p-4" key={attachment.id}>
                    <div className="space-y-2">
                      <p className="font-semibold text-foreground">{attachment.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {attachment.mimeType ?? "Unknown type"} · class {attachment.classification}
                      </p>
                    </div>
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
