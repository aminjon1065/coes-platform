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
import { listPositions } from "@/lib/admin";
import { getFileDetail, getDownloadUrl } from "@/lib/files";
import {
  grantFilePermissionAction,
  linkFileAction,
  revokeFilePermissionAction,
  unlinkFileAction,
  uploadFileVersionAction,
} from "../actions";

type FileDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDateTime(value: string | null) {
  if (!value) return "n/a";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-GB");
}

function formatSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FileDetailPage({ params }: FileDetailPageProps) {
  const { id } = await params;
  const [detail, positions, download] = await Promise.all([
    getFileDetail(id),
    listPositions(),
    getDownloadUrl(id).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link className="transition hover:text-foreground" href="/files">
          Files
        </Link>{" "}
        / {detail.file.displayName}
      </nav>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{detail.file.scanStatus}</Badge>
            <Badge variant="secondary">Class {detail.file.classification}</Badge>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="font-heading text-3xl">{detail.file.displayName}</CardTitle>
              <CardDescription>{detail.file.originalFilename}</CardDescription>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                {formatSize(detail.file.totalSizeBytes)}
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                {detail.file.versionCount} versions
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                Updated {formatDateTime(detail.file.updatedAt)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {download ? (
            <a
              className="inline-flex text-sm font-medium text-primary transition hover:text-primary/80"
              href={download.url}
              rel="noreferrer"
              target="_blank"
            >
              Open download URL
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              Download URL unavailable. This usually means the file is not clean yet.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Versions</CardTitle>
            <CardDescription>Upload a new binary and review prior revisions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={uploadFileVersionAction} className="grid gap-4">
              <input name="fileId" type="hidden" value={detail.file.id} />
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>New version file</span>
                <Input name="file" required type="file" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Upload note</span>
                <Textarea name="uploadNote" rows={3} />
              </label>
              <Button type="submit">Upload new version</Button>
            </form>
            {detail.versions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                No versions found.
              </div>
            ) : (
              <div className="space-y-3">
                {detail.versions.map((version) => (
                  <div key={version.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">v{version.versionNumber}</p>
                      <Badge variant="outline">{formatSize(version.sizeBytes)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatDateTime(version.createdAt)}
                    </p>
                    {version.uploadNote ? (
                      <p className="mt-2 text-sm text-foreground">{version.uploadNote}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Permissions</CardTitle>
            <CardDescription>Grant or revoke explicit position-based access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={grantFilePermissionAction} className="grid gap-4">
              <input name="fileId" type="hidden" value={detail.file.id} />
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Grantee position</span>
                <select
                  className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                  defaultValue=""
                  name="granteePositionId"
                >
                  <option disabled value="">
                    Select position
                  </option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.title}
                      {position.departmentName ? ` (${position.departmentName})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Action</span>
                  <select
                    className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                    defaultValue="read"
                    name="action"
                  >
                    <option value="read">read</option>
                    <option value="download">download</option>
                    <option value="write">write</option>
                    <option value="delete">delete</option>
                    <option value="share">share</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Effect</span>
                  <select
                    className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                    defaultValue="allow"
                    name="effect"
                  >
                    <option value="allow">allow</option>
                    <option value="deny">deny</option>
                  </select>
                </label>
              </div>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Expires at</span>
                <Input name="expiresAt" type="datetime-local" />
              </label>
              <Button type="submit">Grant permission</Button>
            </form>
            {detail.permissions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
                No explicit permissions.
              </div>
            ) : (
              <div className="space-y-3">
                {detail.permissions.map((permission) => (
                  <div key={permission.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <p className="text-base font-semibold text-foreground">
                          {permission.granteePositionId}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {permission.effect} | {permission.action}
                          {permission.expiresAt
                            ? ` | expires ${formatDateTime(permission.expiresAt)}`
                            : ""}
                        </p>
                      </div>
                      <form action={revokeFilePermissionAction}>
                        <input name="fileId" type="hidden" value={detail.file.id} />
                        <input name="permissionId" type="hidden" value={permission.id} />
                        <Button type="submit" variant="outline">
                          Revoke
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Entity links</CardTitle>
          <CardDescription>Bind this file to operational entities or remove existing links.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-2">
          <form action={linkFileAction} className="space-y-4 rounded-3xl border border-border/70 bg-background/80 p-5">
            <input name="fileId" type="hidden" value={detail.file.id} />
            <h3 className="text-lg font-semibold text-foreground">Link entity</h3>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Entity type</span>
              <select
                className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                defaultValue="document"
                name="linkedEntityType"
              >
                <option value="document">document</option>
                <option value="task">task</option>
                <option value="message">message</option>
                <option value="channel">channel</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Entity ID</span>
              <Input name="linkedEntityId" />
            </label>
            <Button type="submit">Link entity</Button>
          </form>

          <form action={unlinkFileAction} className="space-y-4 rounded-3xl border border-border/70 bg-background/80 p-5">
            <input name="fileId" type="hidden" value={detail.file.id} />
            <h3 className="text-lg font-semibold text-foreground">Unlink entity</h3>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Linked entity type</span>
              <select
                className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                defaultValue="document"
                name="linkedEntityType"
              >
                <option value="document">document</option>
                <option value="task">task</option>
                <option value="message">message</option>
                <option value="channel">channel</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Linked entity ID</span>
              <Input name="linkedEntityId" />
            </label>
            <Button type="submit" variant="outline">
              Unlink entity
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
