import Link from "next/link";
import { getFolderContents } from "@/lib/files";
import {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  uploadFileAction,
} from "./actions";
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

type FilesPageProps = {
  searchParams?: Promise<{ folder?: string }>;
};

function formatSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-GB");
}

export default async function FilesPage({ searchParams }: FilesPageProps) {
  const params = (await searchParams) ?? {};
  const folderId = params.folder?.trim() || undefined;
  const contents = await getFolderContents(folderId);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge className="w-fit">Files</Badge>
              <CardTitle className="font-display text-3xl">Storage view</CardTitle>
              <CardDescription>Folders and files for the current storage scope.</CardDescription>
            </div>
            {folderId ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/files">Back to root</Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Folders</p>
              <ul className="space-y-3">
                {contents.folders.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                    No folders in this scope.
                  </li>
                ) : (
                  contents.folders.map((folder) => (
                    <li className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between" key={folder.id}>
                      <div className="space-y-2">
                        <Link className="font-semibold text-foreground" href={`/files?folder=${folder.id}`}>
                          {folder.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          class {folder.classification} · updated {formatDateTime(folder.updatedAt)}
                        </p>
                      </div>
                      <form action={deleteFolderAction}>
                        <input name="folderId" type="hidden" value={folder.id} />
                        <Button type="submit" variant="secondary">
                          Delete
                        </Button>
                      </form>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Files</p>
              <ul className="space-y-3">
                {contents.files.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                    No files in this scope.
                  </li>
                ) : (
                  contents.files.map((file) => (
                    <li className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-white/70 p-4 md:flex-row md:items-start md:justify-between" key={file.id}>
                      <div className="space-y-2">
                        <Link className="font-semibold text-foreground" href={`/files/${file.id}`}>
                          {file.displayName}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {formatSize(file.totalSizeBytes)} · {file.scanStatus} · versions {file.versionCount}
                        </p>
                      </div>
                      <form action={deleteFileAction}>
                        <input name="fileId" type="hidden" value={file.id} />
                        <Button type="submit" variant="secondary">
                          Delete
                        </Button>
                      </form>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl">Create folder</CardTitle>
              <CardDescription>Add a new folder inside the current scope.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createFolderAction} className="grid gap-4">
                <input name="parentId" type="hidden" value={folderId ?? ""} />
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Name
                  <Input name="name" required />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Classification
                  <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="1" name="classification">
                    <option value="0">Public</option>
                    <option value="1">Internal</option>
                    <option value="2">Confidential</option>
                    <option value="3">Secret</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Description
                  <Textarea name="description" rows={3} />
                </label>
                <Button className="w-fit" type="submit">
                  Create folder
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl">Upload file</CardTitle>
              <CardDescription>Files may remain unavailable until the scan status becomes `clean`.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={uploadFileAction} className="grid gap-4">
                <input name="folderId" type="hidden" value={folderId ?? ""} />
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  File
                  <Input name="file" required type="file" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Display name
                  <Input name="displayName" />
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Classification
                  <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="1" name="classification">
                    <option value="0">Public</option>
                    <option value="1">Internal</option>
                    <option value="2">Confidential</option>
                    <option value="3">Secret</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Upload note
                  <Textarea name="uploadNote" rows={3} />
                </label>
                <Button className="w-fit" type="submit">
                  Upload file
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
