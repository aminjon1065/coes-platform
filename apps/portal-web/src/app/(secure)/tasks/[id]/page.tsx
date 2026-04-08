import Link from "next/link";
import { getTaskDetailData } from "@/lib/tasks";
import { addTaskCommentAction, transitionTaskAction } from "./actions";

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
    <div className="portal-stack">
      <nav className="portal-note">
        <Link href="/tasks">Tasks</Link> / {task.title}
      </nav>

      <section className="portal-panel">
        <div className="portal-row">
          <div>
            <span className="portal-pill">{task.status}</span>
            <h2>{task.title}</h2>
            <p className="portal-note">
              Priority {task.priority} · due {formatDateTime(task.dueAt)}
              {task.isOverdue ? " · overdue" : ""}
            </p>
          </div>
          <div className="portal-metadata">
            <span>Progress {task.progressPercent}%</span>
            <span>Updated {formatDateTime(task.updatedAt)}</span>
          </div>
        </div>
        {task.description ? <p>{task.description}</p> : null}
        {task.progressNote ? (
          <p className="portal-note">Latest progress note: {task.progressNote}</p>
        ) : null}
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Actions</h2>
        </div>
        {availableTransitions.length === 0 ? (
          <p className="portal-note">No further transitions available from the current state.</p>
        ) : (
          <form action={transitionTaskAction} className="portal-form">
            <input name="taskId" type="hidden" value={task.id} />
            <label>
              Target status
              <select className="portal-input" defaultValue={availableTransitions[0]} name="targetStatus">
                {availableTransitions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <textarea
                className="portal-input"
                name="reason"
                placeholder="Required for on_hold, cannot_execute, cancelled, returned"
                rows={3}
              />
            </label>
            <label>
              Completion report
              <textarea
                className="portal-input"
                name="completionReport"
                placeholder="Required when completing a task"
                rows={3}
              />
            </label>
            <div className="portal-columns portal-columns-tight">
              <label>
                Progress %
                <input
                  className="portal-input"
                  defaultValue={task.progressPercent}
                  max="100"
                  min="0"
                  name="progressPercent"
                  type="number"
                />
              </label>
              <label>
                Progress note
                <input
                  className="portal-input"
                  defaultValue={task.progressNote ?? ""}
                  name="progressNote"
                  type="text"
                />
              </label>
            </div>
            <button className="portal-button" type="submit">
              Apply transition
            </button>
          </form>
        )}
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Subtasks</h2>
          </div>
          <ul className="portal-list">
            {task.subtasks.length === 0 ? (
              <li>No subtasks.</li>
            ) : (
              task.subtasks.map((subtask) => (
                <li key={subtask.id}>
                  <div className="portal-row">
                    <Link className="portal-item-link" href={`/tasks/${subtask.id}`}>
                      {subtask.title}
                    </Link>
                    <span className="portal-pill">{subtask.status}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Attachments</h2>
          </div>
          <ul className="portal-list">
            {task.attachments.length === 0 ? (
              <li>No attachments.</li>
            ) : (
              task.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <strong>{attachment.name}</strong>
                  <p className="portal-note">
                    {attachment.mimeType ?? "Unknown type"} · class {attachment.classification}
                  </p>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Comments</h2>
        </div>
        <form action={addTaskCommentAction} className="portal-form">
          <input name="taskId" type="hidden" value={task.id} />
          <label>
            New comment
            <textarea
              className="portal-input"
              name="body"
              placeholder="Add an operational comment"
              rows={3}
            />
          </label>
          <label className="portal-check">
            <input name="isInternal" type="checkbox" />
            <span>Internal comment</span>
          </label>
          <button className="portal-button" type="submit">
            Add comment
          </button>
        </form>
        <ul className="portal-list">
          {task.comments.length === 0 ? (
            <li>No comments.</li>
          ) : (
            task.comments.map((comment) => (
              <li key={comment.id}>
                <div className="portal-row">
                  <div>
                    <strong>{comment.authorLabel}</strong>
                    <p>{comment.body}</p>
                    <p className="portal-note">
                      {formatDateTime(comment.createdAt)}
                      {comment.isInternal ? " · internal" : ""}
                    </p>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
