import Link from "next/link";
import { getDashboardData } from "@/lib/dashboard";
import { getGisSummaryData } from "@/lib/gis";
import { getSearchHealth, listAdminUsers, listRoles } from "@/lib/admin";
import { getPortalContext, hasWorkspace } from "@/lib/portal-context";

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

  const dashboardCards = [
    {
      label: "My tasks",
      value: dashboard.stats.taskCount,
      detail: "Active workload visible through the portal BFF.",
      href: "/tasks",
    },
    {
      label: "Overdue tasks",
      value: dashboard.stats.overdueTaskCount,
      detail: "Escalation-sensitive items requiring attention.",
      href: "/tasks?isOverdue=true",
    },
    {
      label: "Docs in workflow",
      value: dashboard.stats.documentsInWorkflow,
      detail: "EDMS items currently moving through approval flow.",
      href: "/edms?status=in_workflow",
    },
    {
      label: "Unread alerts",
      value: dashboard.stats.unreadNotifications,
      detail: "Unread notification count from the central inbox.",
      href: "/notifications",
    },
  ];

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <span className="portal-pill">Dashboard</span>
        <h2>Personalized workspace overview</h2>
        <p className="portal-note">
          Current operator: {dashboard.user.displayName}. Core modules stay available to
          everyone, while admin and analytics surfaces appear by effective capability.
        </p>
      </section>

      <section className="portal-kpis">
        {dashboardCards.map((card) => (
          <Link className="portal-kpi portal-link-card" href={card.href} key={card.label}>
            <span className="portal-note">{card.label}</span>
            <strong>{card.value}</strong>
            <p className="portal-note">{card.detail}</p>
          </Link>
        ))}
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>My tasks</h2>
            <Link href="/tasks">View all</Link>
          </div>
          <ul className="portal-list">
            {dashboard.tasks.length === 0 ? (
              <li>No visible tasks.</li>
            ) : (
              dashboard.tasks.map((task) => (
                <li key={task.id}>
                  <div className="portal-row">
                    <div>
                      <Link className="portal-item-link" href={`/tasks/${task.id}`}>
                        {task.title}
                      </Link>
                      <p className="portal-note">
                        {task.dueAt ? `Due ${task.dueAt}` : "No deadline"} В· {task.priority}
                      </p>
                    </div>
                    <span className="portal-pill">{task.status}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Recent documents</h2>
            <Link href="/edms">View all</Link>
          </div>
          <ul className="portal-list">
            {dashboard.documents.length === 0 ? (
              <li>No visible documents.</li>
            ) : (
              dashboard.documents.map((document) => (
                <li key={document.id}>
                  <div className="portal-row">
                    <div>
                      <Link className="portal-item-link" href={`/edms/${document.id}`}>
                        {document.registrationNumber
                          ? `${document.registrationNumber} В· ${document.title}`
                          : document.title}
                      </Link>
                      <p className="portal-note">
                        {document.direction} В· updated {document.updatedAt}
                      </p>
                    </div>
                    <span className="portal-pill">{document.status}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      {showAdminWorkspace ? (
        <section className="portal-panel">
          <div className="portal-section-head">
            <div>
              <span className="portal-pill">Admin workspace</span>
              <h2>Platform control surface</h2>
            </div>
            <Link className="portal-button secondary" href="/admin">
              Open admin
            </Link>
          </div>
          <div className="portal-kpis">
            <Link className="portal-kpi portal-link-card" href="/admin/users">
              <span className="portal-note">Users</span>
              <strong>{adminUsers?.total ?? 0}</strong>
              <p className="portal-note">Provision and offboard operator accounts.</p>
            </Link>
            <Link className="portal-kpi portal-link-card" href="/admin/roles">
              <span className="portal-note">Roles</span>
              <strong>{adminRoles?.length ?? 0}</strong>
              <p className="portal-note">Manage platform capabilities and role design.</p>
            </Link>
            <Link className="portal-kpi portal-link-card" href="/admin">
              <span className="portal-note">Monitoring</span>
              <strong>{searchHealth?.ready ? "Ready" : "Review"}</strong>
              <p className="portal-note">Current portal monitoring surface for search and system readiness.</p>
            </Link>
          </div>
        </section>
      ) : null}

      {showAnalyticsWorkspace ? (
        <section className="portal-panel">
          <div className="portal-section-head">
            <div>
              <span className="portal-pill">Analytics workspace</span>
              <h2>Analytical operations</h2>
            </div>
            <Link className="portal-button secondary" href="/analytics">
              Open analytics
            </Link>
          </div>
          <div className="portal-kpis">
            <Link className="portal-kpi portal-link-card" href="/gis">
              <span className="portal-note">Open incidents</span>
              <strong>{gisSummary?.openIncidents ?? 0}</strong>
              <p className="portal-note">Live GIS incidents requiring review and correlation.</p>
            </Link>
            <Link className="portal-kpi portal-link-card" href="/gis">
              <span className="portal-note">High severity</span>
              <strong>{gisSummary?.highSeverityIncidents ?? 0}</strong>
              <p className="portal-note">Critical and high-severity incidents in the monitored space.</p>
            </Link>
            <Link className="portal-kpi portal-link-card" href="/search">
              <span className="portal-note">Analytical tools</span>
              <strong>
                {
                  portalContext.capabilities.filter(
                    (item) =>
                      item.startsWith("gis.") ||
                      item.startsWith("search.") ||
                      item.startsWith("analytics."),
                  ).length
                }
              </strong>
              <p className="portal-note">GIS, search, and investigation capabilities assigned to this user.</p>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Unread notifications</h2>
          <Link href="/notifications">View all</Link>
        </div>
        <ul className="portal-list">
          {dashboard.notifications.length === 0 ? (
            <li>No unread notifications.</li>
          ) : (
            dashboard.notifications.map((notification) => (
              <li key={notification.id}>
                <div className="portal-row">
                  <div>
                    <Link
                      className="portal-item-link"
                      href={notification.href ?? "/notifications"}
                    >
                      {notification.title}
                    </Link>
                    <p className="portal-note">
                      {notification.body ?? "No body"} В· {notification.createdAt}
                    </p>
                  </div>
                  <span className="portal-pill">{notification.priority}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
