import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPortalContext, hasWorkspace } from "@/lib/portal-context";

export default async function AnalyticsLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const portalContext = await getPortalContext();
  if (!hasWorkspace(portalContext, "analytics")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-4">
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">Investigations and analytical operations</CardTitle>
            <CardDescription>
              Incident analysis, forms, reports, and GIS tools in one workspace.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/analytics"><Button type="button" variant="outline">Overview</Button></Link>
          <Link href="/analytics/incidents"><Button type="button" variant="outline">Incidents</Button></Link>
          <Link href="/analytics/forms"><Button type="button" variant="outline">Forms</Button></Link>
          <Link href="/analytics/reports"><Button type="button" variant="outline">Reports</Button></Link>
          <Link href="/gis"><Button type="button" variant="outline">GIS</Button></Link>
        </CardContent>
      </Card>
      {children}
    </div>
  );
}
