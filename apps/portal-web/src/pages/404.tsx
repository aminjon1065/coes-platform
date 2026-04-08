export default function NotFoundErrorPage() {
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
        <h1 style={{ margin: "12px 0 8px", fontSize: "36px", lineHeight: 1.1 }}>404</h1>
        <p style={{ margin: "0 0 12px", fontSize: "20px" }}>Page not found</p>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          The requested route does not exist in the portal or is no longer available.
        </p>
      </section>
    </main>
  );
}
