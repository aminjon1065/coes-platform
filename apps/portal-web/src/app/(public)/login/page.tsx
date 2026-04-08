import Link from "next/link";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const errorCode = typeof params.error === "string" ? params.error : "";
  const errorMessage =
    errorCode === "missing-credentials"
      ? "Username and password are required."
      : errorCode === "invalid-credentials"
        ? "Invalid credentials or unavailable backend session endpoint."
        : null;

  return (
    <main className="portal-auth">
      <section className="portal-auth-card">
        <span className="portal-pill">FE-1 foundation</span>
        <h1>Portal bootstrap</h1>
        <p className="portal-note">
          This login now exchanges credentials with the backend IAM service and stores
          `httpOnly` portal session cookies in the Next.js BFF layer.
        </p>
        <form action={loginAction}>
          <label>
            Username
            <input
              name="username"
              placeholder="j.dushanbekov"
              type="text"
            />
          </label>
          <label>
            Password
            <input name="password" placeholder="Password" type="password" />
          </label>
          <button className="portal-button" type="submit">
            Enter portal
          </button>
        </form>
        {errorMessage ? (
          <p className="portal-note" style={{ color: "var(--danger)" }}>
            {errorMessage}
          </p>
        ) : null}
        <div className="portal-actions">
          <Link className="portal-button secondary" href="/dashboard">
            Review secure route
          </Link>
        </div>
      </section>
    </main>
  );
}
