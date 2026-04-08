import { listAdminUsers } from "@/lib/admin";
import { createAdminUserAction, offboardAdminUserAction } from "./actions";

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

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const users = await listAdminUsers(query);

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
            <h2>Profiles</h2>
          </div>
          <ul className="portal-list">
            {users.items.length === 0 ? (
              <li>No users found.</li>
            ) : (
              users.items.map((user) => (
                <li key={user.id}>
                  <div className="portal-row">
                    <div>
                      <strong>{user.displayName}</strong>
                      <p className="portal-note">
                        {user.email} · {clearanceLabel(user.clearanceLevel)} · {user.status}
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
                </li>
              ))
            )}
          </ul>
        </article>
      </section>
    </div>
  );
}
