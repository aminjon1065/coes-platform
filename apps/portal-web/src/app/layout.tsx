import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoES Portal",
  description: "Office portal foundation for the CoES platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
