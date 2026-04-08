import Link from "next/link";
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
    <div className="portal-stack">
      <nav className="portal-note">
        <Link href="/files">Files</Link> / {detail.file.displayName}
      </nav>

      <section className="portal-panel">
        <div className="portal-row">
          <div>
            <span className="portal-pill">{detail.file.scanStatus}</span>
            <h2>{detail.file.displayName}</h2>
            <p className="portal-note">
              {detail.file.originalFilename} · class {detail.file.classification}
            </p>
          </div>
          <div className="portal-metadata">
            <span>{formatSize(detail.file.totalSizeBytes)}</span>
            <span>{detail.file.versionCount} versions</span>
            <span>Updated {formatDateTime(detail.file.updatedAt)}</span>
          </div>
        </div>
        {download ? (
          <p>
            <a className="portal-item-link" href={download.url} rel="noreferrer" target="_blank">
              Open download URL
            </a>
          </p>
        ) : (
          <p className="portal-note">
            Download URL unavailable. This usually means the file is not clean yet.
          </p>
        )}
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Versions</h2>
          </div>
          <form
            action={uploadFileVersionAction}
            className="portal-form"
          >
            <input name="fileId" type="hidden" value={detail.file.id} />
            <label>
              New version file
              <input className="portal-input" name="file" required type="file" />
            </label>
            <label>
              Upload note
              <textarea className="portal-input" name="uploadNote" rows={3} />
            </label>
            <button className="portal-button" type="submit">
              Upload new version
            </button>
          </form>
          <ul className="portal-list">
            {detail.versions.length === 0 ? (
              <li>No versions found.</li>
            ) : (
              detail.versions.map((version) => (
                <li key={version.id}>
                  <strong>v{version.versionNumber}</strong>
                  <p className="portal-note">
                    {formatSize(version.sizeBytes)} · {formatDateTime(version.createdAt)}
                  </p>
                  {version.uploadNote ? <p>{version.uploadNote}</p> : null}
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Permissions</h2>
          </div>
          <form action={grantFilePermissionAction} className="portal-form">
            <input name="fileId" type="hidden" value={detail.file.id} />
            <label>
              Grantee position
              <select className="portal-input" defaultValue="" name="granteePositionId">
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
            <label>
              Action
              <select className="portal-input" defaultValue="read" name="action">
                <option value="read">read</option>
                <option value="download">download</option>
                <option value="write">write</option>
                <option value="delete">delete</option>
                <option value="share">share</option>
              </select>
            </label>
            <label>
              Effect
              <select className="portal-input" defaultValue="allow" name="effect">
                <option value="allow">allow</option>
                <option value="deny">deny</option>
              </select>
            </label>
            <label>
              Expires at
              <input className="portal-input" name="expiresAt" type="datetime-local" />
            </label>
            <button className="portal-button" type="submit">
              Grant permission
            </button>
          </form>
          <ul className="portal-list">
            {detail.permissions.length === 0 ? (
              <li>No explicit permissions.</li>
            ) : (
              detail.permissions.map((permission) => (
                <li key={permission.id}>
                  <div className="portal-row">
                    <div>
                      <strong>{permission.granteePositionId}</strong>
                      <p className="portal-note">
                        {permission.effect} · {permission.action}
                        {permission.expiresAt ? ` · expires ${formatDateTime(permission.expiresAt)}` : ""}
                      </p>
                    </div>
                    <form action={revokeFilePermissionAction}>
                      <input name="fileId" type="hidden" value={detail.file.id} />
                      <input name="permissionId" type="hidden" value={permission.id} />
                      <button className="portal-button secondary" type="submit">
                        Revoke
                      </button>
                    </form>
                  </div>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Entity links</h2>
        </div>
        <form action={linkFileAction} className="portal-form">
          <input name="fileId" type="hidden" value={detail.file.id} />
          <div className="portal-columns portal-columns-tight">
            <label>
              Entity type
              <select className="portal-input" defaultValue="document" name="linkedEntityType">
                <option value="document">document</option>
                <option value="task">task</option>
                <option value="message">message</option>
                <option value="channel">channel</option>
              </select>
            </label>
            <label>
              Entity ID
              <input className="portal-input" name="linkedEntityId" />
            </label>
          </div>
          <button className="portal-button" type="submit">
            Link entity
          </button>
        </form>
        <form action={unlinkFileAction} className="portal-form">
          <input name="fileId" type="hidden" value={detail.file.id} />
          <div className="portal-columns portal-columns-tight">
            <label>
              Linked entity type
              <select className="portal-input" defaultValue="document" name="linkedEntityType">
                <option value="document">document</option>
                <option value="task">task</option>
                <option value="message">message</option>
                <option value="channel">channel</option>
              </select>
            </label>
            <label>
              Linked entity ID
              <input className="portal-input" name="linkedEntityId" />
            </label>
          </div>
          <button className="portal-button secondary" type="submit">
            Unlink entity
          </button>
        </form>
      </section>
    </div>
  );
}
