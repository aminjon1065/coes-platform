import {
  flattenDepartments,
  getAdminUserRegistry,
  getDepartmentTree,
  listPositions,
  listRoles,
} from "@/lib/admin";
import {
  assignUserPositionAction,
  assignUserRoleAction,
  createAdminUserAction,
  offboardAdminUserAction,
  revokeUserRoleAssignmentAction,
  vacateUserPositionAction,
} from "./actions";

type UsersPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

function clearanceLabel(level: number) {
  switch (level) {
    case 0:
      return "Public";
    case 1:
      return "Internal";
    case 2:
      return "Confidential";
    case 3:
      return "Secret";
    default:
      return String(level);
  }
}

function assignmentTypeLabel(type: string) {
  switch (type) {
    case "primary":
      return "Primary";
    case "acting":
      return "Acting";
    case "concurrent":
      return "Concurrent";
    default:
      return type;
  }
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const [users, roles, departmentTree, positions] = await Promise.all([
    getAdminUserRegistry(query),
    listRoles(),
    getDepartmentTree(),
    listPositions(),
  ]);
  const departments = flattenDepartments(departmentTree);

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Users</span>
            <h2>User registry</h2>
          </div>
          <p className="portal-note">{users.total} profiles</p>
        </div>
        <form className="portal-inline-form" method="get">
          <input
            className="portal-input"
            defaultValue={query}
            name="q"
            placeholder="Search by display name or email"
          />
          <button className="portal-button" type="submit">
            Search
          </button>
        </form>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Create user</h2>
          </div>
          <form action={createAdminUserAction} className="portal-form">
            <div className="portal-columns portal-columns-tight">
              <label>
                First name
                <input className="portal-input" name="firstName" required />
              </label>
              <label>
                Last name
                <input className="portal-input" name="lastName" required />
              </label>
              <label>
                Middle name
                <input className="portal-input" name="middleName" />
              </label>
              <label>
                Display name
                <input className="portal-input" name="displayName" />
              </label>
              <label>
                Username
                <input className="portal-input" name="username" required />
              </label>
              <label>
                Email
                <input className="portal-input" name="email" required type="email" />
              </label>
              <label>
                Password
                <input className="portal-input" minLength={12} name="password" required type="password" />
              </label>
              <label>
                Phone
                <input className="portal-input" name="phone" />
              </label>
              <label>
                Clearance
                <select className="portal-input" defaultValue="1" name="clearanceLevel">
                  <option value="0">Public</option>
                  <option value="1">Internal</option>
                  <option value="2">Confidential</option>
                  <option value="3">Secret</option>
                </select>
              </label>
            </div>
            <button className="portal-button" type="submit">
              Create user
            </button>
          </form>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Profiles, roles, and positions</h2>
          </div>
          <ul className="portal-list">
            {users.items.length === 0 ? (
              <li>No users found.</li>
            ) : (
              users.items.map((user) => {
                const roleAssignments = user.roleAssignments;
                const positionAssignments = user.positionAssignments;

                return (
                  <li key={user.id}>
                    <div className="portal-stack">
                      <div className="portal-row">
                        <div>
                          <strong>{user.displayName}</strong>
                          <p className="portal-note">
                            {user.email} В· {clearanceLabel(user.clearanceLevel)} В· {user.status}
                          </p>
                        </div>
                        {user.status === "active" ? (
                          <form action={offboardAdminUserAction}>
                            <input name="userId" type="hidden" value={user.id} />
                            <button className="portal-button secondary" type="submit">
                              Offboard
                            </button>
                          </form>
                        ) : null}
                      </div>

                      <div className="portal-columns admin-split">
                        <div className="portal-stack">
                          <p className="portal-note">Assigned roles</p>
                          {roleAssignments.length === 0 ? (
                            <p className="portal-note">No active role assignments.</p>
                          ) : (
                            <ul className="portal-list">
                              {roleAssignments.map((assignment) => (
                                <li key={assignment.id}>
                                  <div className="portal-row">
                                    <div>
                                      <strong>{assignment.roleName}</strong>
                                      <p className="portal-note">
                                        {assignment.departmentScopeId
                                          ? `department ${assignment.departmentScopeId}`
                                          : "global scope"}
                                        {assignment.expiresAt ? ` В· expires ${assignment.expiresAt}` : ""}
                                      </p>
                                    </div>
                                    <form action={revokeUserRoleAssignmentAction}>
                                      <input name="credentialId" type="hidden" value={user.credentialId} />
                                      <input name="assignmentId" type="hidden" value={assignment.id} />
                                      <button className="portal-button secondary" type="submit">
                                        Revoke
                                      </button>
                                    </form>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}

                          <form action={assignUserRoleAction} className="portal-form">
                            <input name="credentialId" type="hidden" value={user.credentialId} />
                            <div className="portal-columns portal-columns-tight">
                              <label>
                                Role
                                <select className="portal-input" defaultValue="" name="roleId" required>
                                  <option value="">Select role</option>
                                  {roles.map((role) => (
                                    <option key={role.id} value={role.id}>
                                      {role.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Department scope
                                <select className="portal-input" defaultValue="" name="departmentScopeId">
                                  <option value="">Global scope</option>
                                  {departments.map((department) => (
                                    <option key={department.id} value={department.id}>
                                      {"".padStart(department.depth * 2, " ")}
                                      {department.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Expires at
                                <input className="portal-input" name="expiresAt" type="datetime-local" />
                              </label>
                            </div>
                            <div className="portal-actions">
                              <button className="portal-button" type="submit">
                                Assign role
                              </button>
                            </div>
                          </form>
                        </div>

                        <div className="portal-stack">
                          <p className="portal-note">Position assignments</p>
                          {positionAssignments.length === 0 ? (
                            <p className="portal-note">No active position assignments.</p>
                          ) : (
                            <ul className="portal-list">
                              {positionAssignments.map((assignment) => {
                                return (
                                  <li key={assignment.id}>
                                    <div className="portal-row">
                                      <div>
                                        <strong>{assignment.positionTitle ?? assignment.positionId}</strong>
                                        <p className="portal-note">
                                          {assignmentTypeLabel(assignment.type)}
                                          {assignment.departmentName ? ` В· ${assignment.departmentName}` : ""}
                                          {assignment.notes ? ` В· ${assignment.notes}` : ""}
                                        </p>
                                      </div>
                                      <form action={vacateUserPositionAction}>
                                        <input name="userId" type="hidden" value={user.id} />
                                        <input name="positionId" type="hidden" value={assignment.positionId} />
                                        <button className="portal-button secondary" type="submit">
                                          Vacate
                                        </button>
                                      </form>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          <form action={assignUserPositionAction} className="portal-form">
                            <input name="userId" type="hidden" value={user.id} />
                            <div className="portal-columns portal-columns-tight">
                              <label>
                                Position
                                <select className="portal-input" defaultValue="" name="positionId" required>
                                  <option value="">Select position</option>
                                  {positions.map((position) => (
                                    <option key={position.id} value={position.id}>
                                      {position.title}
                                      {position.departmentName ? ` · ${position.departmentName}` : ""}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Assignment type
                                <select className="portal-input" defaultValue="primary" name="type">
                                  <option value="primary">Primary</option>
                                  <option value="acting">Acting</option>
                                  <option value="concurrent">Concurrent</option>
                                </select>
                              </label>
                              <label>
                                Effective at
                                <input className="portal-input" name="assignedAt" type="datetime-local" />
                              </label>
                              <label>
                                Notes
                                <input className="portal-input" name="notes" />
                              </label>
                            </div>
                            <div className="portal-actions">
                              <button className="portal-button" type="submit">
                                Assign position
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </article>
      </section>
    </div>
  );
}
