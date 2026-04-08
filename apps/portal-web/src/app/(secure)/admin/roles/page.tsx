import { createRoleAction, deleteRoleAction } from "./actions";
import { listCapabilities, listRoles } from "@/lib/admin";

export default async function AdminRolesPage() {
  const [roles, capabilities] = await Promise.all([listRoles(), listCapabilities()]);

  return (
    <div className="portal-stack">
      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <div>
              <span className="portal-pill">Roles</span>
              <h2>Authorization roles</h2>
            </div>
          </div>
          <ul className="portal-list">
            {roles.length === 0 ? (
              <li>No roles defined.</li>
            ) : (
              roles.map((role) => (
                <li key={role.id}>
                  <div className="portal-row">
                    <div>
                      <strong>{role.name}</strong>
                      <p className="portal-note">
                        {role.description ?? "No description"} · {role.permissions.length} permissions
                        {role.isSystemRole ? " · system" : ""}
                      </p>
                      {role.permissions.length > 0 ? (
                        <p className="portal-note">{role.permissions.join(", ")}</p>
                      ) : null}
                    </div>
                    {!role.isSystemRole ? (
                      <form action={deleteRoleAction}>
                        <input name="roleId" type="hidden" value={role.id} />
                        <button className="portal-button secondary" type="submit">
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Create role</h2>
          </div>
          <form action={createRoleAction} className="portal-form">
            <label>
              Name
              <input className="portal-input" name="name" required />
            </label>
            <label>
              Description
              <input className="portal-input" name="description" />
            </label>
            <label>
              Parent role
              <select className="portal-input" defaultValue="" name="parentRoleId">
                <option value="">No parent</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="portal-fieldset">
              <legend>Capabilities</legend>
              <div className="portal-check-grid">
                {capabilities.map((capability) => (
                  <label key={capability} className="portal-check">
                    <input name="permissionNames" type="checkbox" value={capability} />
                    <span>{capability}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="portal-button" type="submit">
              Create role
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
