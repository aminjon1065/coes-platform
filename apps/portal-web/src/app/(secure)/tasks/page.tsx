import Link from "next/link";
import { getTasksData } from "@/lib/tasks";

function formatDate(value: string | null) {
  if (!value) return "No deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
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

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <span className="portal-pill">Tasks</span>
        <h2>My tasks</h2>
        <p className="portal-note">
          Read-only task list migrated into the portal BFF. Showing {tasks.total} visible
          items for the current filter set.
        </p>
      </section>

      <section className="portal-panel">
        <ul className="portal-list">
          {tasks.items.length === 0 ? (
            <li>No tasks found.</li>
          ) : (
            tasks.items.map((task) => (
              <li key={task.id}>
                <div className="portal-row">
                  <div>
                    <Link className="portal-item-link" href={`/tasks/${task.id}`}>
                      {task.title}
                    </Link>
                    <p className="portal-note">
                      {formatDate(task.dueAt)} · {task.priority}
                      {task.isOverdue ? " · overdue" : ""}
                    </p>
                  </div>
                  <span className="portal-pill">{task.status}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
