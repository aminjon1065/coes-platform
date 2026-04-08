import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="portal-auth">
      <section className="portal-auth-card">
        <span className="portal-pill">404</span>
        <h1>Page not found</h1>
        <p className="portal-note">
          The requested route does not exist in the portal or is no longer available.
        </p>
        <div className="portal-actions">
          <Link className="portal-button" href="/dashboard">
            Back to dashboard
          </Link>
          <Link className="portal-button secondary" href="/login">
            Sign in again
          </Link>
        </div>
      </section>
    </main>
  );
}
