import Link from "next/link";
import { getFolderContents } from "@/lib/files";
import {
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  uploadFileAction,
} from "./actions";

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
    <div className="portal-stack">
      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <div>
              <span className="portal-pill">Files</span>
              <h2>Storage view</h2>
            </div>
            {folderId ? (
              <Link className="portal-button secondary" href="/files">
                Back to root
              </Link>
            ) : null}
          </div>

          <h3>Folders</h3>
          <ul className="portal-list">
            {contents.folders.length === 0 ? (
              <li>No folders in this scope.</li>
            ) : (
              contents.folders.map((folder) => (
                <li key={folder.id}>
                  <div className="portal-row">
                    <div>
                      <Link className="portal-item-link" href={`/files?folder=${folder.id}`}>
                        {folder.name}
                      </Link>
                      <p className="portal-note">
                        class {folder.classification} · updated {formatDateTime(folder.updatedAt)}
                      </p>
                    </div>
                    <form action={deleteFolderAction}>
                      <input name="folderId" type="hidden" value={folder.id} />
                      <button className="portal-button secondary" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))
            )}
          </ul>

          <h3>Files</h3>
          <ul className="portal-list">
            {contents.files.length === 0 ? (
              <li>No files in this scope.</li>
            ) : (
              contents.files.map((file) => (
                <li key={file.id}>
                  <div className="portal-row">
                    <div>
                      <Link className="portal-item-link" href={`/files/${file.id}`}>
                        {file.displayName}
                      </Link>
                      <p className="portal-note">
                        {formatSize(file.totalSizeBytes)} · {file.scanStatus} · versions {file.versionCount}
                      </p>
                    </div>
                    <form action={deleteFileAction}>
                      <input name="fileId" type="hidden" value={file.id} />
                      <button className="portal-button secondary" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Create folder</h2>
          </div>
          <form action={createFolderAction} className="portal-form">
            <input name="parentId" type="hidden" value={folderId ?? ""} />
            <label>
              Name
              <input className="portal-input" name="name" required />
            </label>
            <label>
              Classification
              <select className="portal-input" defaultValue="1" name="classification">
                <option value="0">Public</option>
                <option value="1">Internal</option>
                <option value="2">Confidential</option>
                <option value="3">Secret</option>
              </select>
            </label>
            <label>
              Description
              <textarea className="portal-input" name="description" rows={3} />
            </label>
            <button className="portal-button" type="submit">
              Create folder
            </button>
          </form>
          <div className="portal-section-head">
            <h2>Upload file</h2>
          </div>
          <form
            action={uploadFileAction}
            className="portal-form"
          >
            <input name="folderId" type="hidden" value={folderId ?? ""} />
            <label>
              File
              <input className="portal-input" name="file" required type="file" />
            </label>
            <label>
              Display name
              <input className="portal-input" name="displayName" />
            </label>
            <label>
              Classification
              <select className="portal-input" defaultValue="1" name="classification">
                <option value="0">Public</option>
                <option value="1">Internal</option>
                <option value="2">Confidential</option>
                <option value="3">Secret</option>
              </select>
            </label>
            <label>
              Upload note
              <textarea className="portal-input" name="uploadNote" rows={3} />
            </label>
            <button className="portal-button" type="submit">
              Upload file
            </button>
          </form>
          <p className="portal-note">
            Uploaded files may stay unavailable for download until virus scan status becomes `clean`.
          </p>
        </article>
      </section>
    </div>
  );
}
