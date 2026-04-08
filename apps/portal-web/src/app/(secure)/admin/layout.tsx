import { redirect } from "next/navigation";
import { getPortalContext, hasWorkspace } from "@/lib/portal-context";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const portalContext = await getPortalContext();
  if (!hasWorkspace(portalContext, "admin")) {
    redirect("/dashboard");
  }
  return children;
}
