import Link from "next/link";
import {
  flattenDepartments,
  getDepartmentTree,
  getSystemHealth,
  getSearchHealth,
  listAuditEvents,
  listAdminUsers,
  listPositions,
  listRoles,
} from "@/lib/admin";

export default async function AdminHomePage() {
  const [users, departments, positions, roles, searchHealth, systemHealth, auditEvents] = await Promise.all([
    listAdminUsers(),
    getDepartmentTree(),
    listPositions(),
    listRoles(),
    getSearchHealth(),
    getSystemHealth(),
    listAuditEvents({ limit: 5 }),
  ]);
  const departmentCount = flattenDepartments(departments).length;

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Administration</span>
            <h2>Platform control plane</h2>
          </div>
          <Link className="portal-button secondary" href="/search">
            Open search
          </Link>
        </div>
        <div className="portal-kpis">
          <div className="portal-kpi">
            Users
            <strong>{users.total}</strong>
          </div>
          <div className="portal-kpi">
            Departments
            <strong>{departmentCount}</strong>
          </div>
          <div className="portal-kpi">
            Positions
            <strong>{positions.length}</strong>
          </div>
          <div className="portal-kpi">
            Roles
            <strong>{roles.length}</strong>
          </div>
          <div className="portal-kpi">
            Backend
            <strong>{systemHealth.status}</strong>
          </div>
          <div className="portal-kpi">
            Search
            <strong>{searchHealth.ready ? "ready" : "degraded"}</strong>
          </div>
        </div>
      </section>

      <section className="portal-columns">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Modules</h2>
          </div>
          <ul className="portal-list">
            <li><Link className="portal-item-link" href="/admin/users">Users</Link></li>
            <li><Link className="portal-item-link" href="/admin/departments">Departments</Link></li>
            <li><Link className="portal-item-link" href="/admin/positions">Positions</Link></li>
            <li><Link className="portal-item-link" href="/admin/roles">Roles</Link></li>
            <li><Link className="portal-item-link" href="/admin/system">System monitoring</Link></li>
            <li><Link className="portal-item-link" href="/admin/logs">Audit logs</Link></li>
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Monitoring snapshot</h2>
          </div>
          <p className="portal-note">
            Backend: {systemHealth.status} В· uptime {systemHealth.uptimeSeconds}s
          </p>
          <p className="portal-note">
            Search status: {searchHealth.ready ? "ready" : "degraded"} В· last health sample {systemHealth.timestamp}
          </p>
          <pre className="portal-code-block">
            {JSON.stringify(
              {
                backend: systemHealth,
                search: searchHealth.details,
              },
              null,
              2,
            )}
          </pre>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Recent audit trail</h2>
          <Link className="portal-button secondary" href="/admin/logs">
            Open logs
          </Link>
        </div>
        <ul className="portal-list">
          {auditEvents.items.length === 0 ? (
            <li>No audit events available.</li>
          ) : (
            auditEvents.items.map((event) => (
              <li key={event.id}>
                <div className="portal-row">
                  <div>
                    <strong>{event.eventType}</strong>
                    <p className="portal-note">
                      {event.actorUsername ?? event.actorId ?? "system"} В· {event.severity} В· {event.occurredAt}
                    </p>
                  </div>
                  <span className="portal-pill">{event.success ? "success" : "failed"}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
