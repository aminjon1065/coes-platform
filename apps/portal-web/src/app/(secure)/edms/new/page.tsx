import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createDocumentAction } from "./actions";
import { getDocumentTypes, getPositionOptions } from "@/lib/edms";

export default async function NewDocumentPage() {
  const [documentTypes, positions] = await Promise.all([
    getDocumentTypes(),
    getPositionOptions(),
  ]);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="w-fit">
              EDMS create
            </Badge>
            <div className="space-y-1">
              <CardTitle className="font-heading text-3xl">New document</CardTitle>
              <CardDescription>
                Recipients format: <code>name|type|positionId</code> per line.
              </CardDescription>
            </div>
          </div>
          <Link href="/edms">
            <Button type="button" variant="outline">
              Back to EDMS
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <form action={createDocumentAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Document type</span>
              <select
                className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                defaultValue={documentTypes[0]?.id ?? ""}
                name="typeId"
              >
                {documentTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.seriesCode ?? "no-series"})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Direction</span>
              <select
                className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                defaultValue="internal"
                name="direction"
              >
                <option value="incoming">incoming</option>
                <option value="outgoing">outgoing</option>
                <option value="internal">internal</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Classification</span>
              <Input defaultValue={1} max={3} min={0} name="classification" type="number" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Sender position</span>
              <select
                className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                defaultValue=""
                name="senderPositionId"
              >
                <option value="">Not set</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.title}
                    {position.departmentName ? ` (${position.departmentName})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-4">
              <span>Subject</span>
              <Input name="subject" required />
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Sender name</span>
              <Input name="senderName" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>External reference number</span>
              <Input name="externalRefNumber" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Document date</span>
              <Input name="documentDate" type="date" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Deadline</span>
              <Input name="deadline" type="date" />
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-4">
              <span>Recipients</span>
              <Textarea name="recipients" rows={5} />
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-4">
              <span>Body</span>
              <Textarea name="body" rows={8} />
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2 xl:col-span-4">
              <span>Related document ID</span>
              <Input name="relatedDocumentId" />
            </label>

            <div className="md:col-span-2 xl:col-span-4">
              <Button type="submit">Create draft</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
