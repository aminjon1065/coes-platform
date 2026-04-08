import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPortalContext, getPortalNavItems } from "@/lib/portal-context";

export const dynamic = "force-dynamic";

export default async function SecureLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  const portalContext = await getPortalContext();

  return (
    <div className="portal-shell">
      <div className="portal-grid">
        <aside className="portal-sidebar">
          <span className="portal-pill">Next.js portal</span>
          <h1>CoES Office Portal</h1>
          <p>
            Unified office portal with shared standards for everyone and dedicated
            workspaces by capability.
          </p>
          <p className="portal-note">
            Session bootstrap user: {sessionUser.displayName} В· clearance{" "}
            {sessionUser.clearanceLevel}
          </p>
          <div className="portal-workspace-list">
            {portalContext.workspaces.map((workspace) => (
              <div className="portal-workspace-item" key={workspace.key}>
                <strong>{workspace.label}</strong>
                <p className="portal-note">{workspace.description}</p>
              </div>
            ))}
          </div>
          <ul>
            {getPortalNavItems(portalContext).map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
          <div className="portal-actions">
            <form action="/api/auth/logout" method="post">
              <button className="portal-button secondary" type="submit">
                Logout
              </button>
            </form>
          </div>
        </aside>
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
