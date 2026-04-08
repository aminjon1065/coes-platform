type ErrorPageProps = {
  statusCode?: number;
};

function getStatusCode(props: ErrorPageProps) {
  if (typeof props.statusCode === "number") {
    return props.statusCode;
  }

  return 500;
}

export default function ErrorPage(props: ErrorPageProps) {
  const statusCode = getStatusCode(props);
  const title =
    statusCode === 404
      ? "Page not found"
      : statusCode === 403
        ? "Access denied"
        : "Portal error";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px",
        background: "#f4f1e8",
        color: "#1c1a16",
        fontFamily: "Georgia, serif",
      }}
    >
      <section
        style={{
          width: "min(560px, 100%)",
          border: "1px solid #d8d1c2",
          background: "#fffdf8",
          padding: "32px",
        }}
      >
        <p style={{ margin: 0, fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Portal status
        </p>
        <h1 style={{ margin: "12px 0 8px", fontSize: "36px", lineHeight: 1.1 }}>
          {statusCode}
        </h1>
        <p style={{ margin: "0 0 12px", fontSize: "20px" }}>{title}</p>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          The portal could not render this page. Return to `/dashboard` or sign in again if your
          session expired.
        </p>
      </section>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: { res?: { statusCode?: number }; err?: { statusCode?: number } }) => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 500,
});
