# Module: Files

## Overview
Manages file storage using MinIO (S3-compatible), file versioning with SHA-256 hash-based deduplication, ClamAV virus scanning, position-based access permissions, folder hierarchy with closure table, and file-resource linking (documents, tasks, messages).

---

## Current Issues

- ❌ **Infected files are briefly accessible** — ClamAV scanning is asynchronous. After a successful MinIO upload, the file's `scanStatus` is `pending`. During the scan window (seconds to minutes), the file can be downloaded by anyone with the link.
- ❌ **Temporary staging objects accumulate** — Files are uploaded to a `tmp/{uuid}` key in MinIO, then renamed. If the rename fails or the process crashes mid-stream, the temp object is never cleaned up. No lifecycle policy or cleanup job exists.
- ❌ **ClamAV scan timeout not handled** — If ClamAV becomes unresponsive, scan jobs queue indefinitely. Files remain in `scan_pending` state forever with no SLA or alerting.
- ❌ **`FilePermission.expires_at` not enforced** — The field exists in the database but `FilesService` never checks `expires_at < now()` when evaluating permissions. Expired permissions grant indefinite access.
- ❌ **Download events not audited** — Uploads trigger an audit event. Downloads do not. This is a compliance gap for classified file access.

---

## Missing Functionality

- 🚫 **Pre-download quarantine gate** — Before serving a download presigned URL, assert `scanStatus === 'clean'`. Files in `pending`, `infected`, or `scan_failed` must be blocked.
- 🚫 **Temporary object cleanup job** — Cron job to delete `tmp/*` MinIO objects older than 1 hour.
- 🚫 **Scan timeout recovery** — A background job that re-enqueues `pending` scan jobs older than a configurable threshold (e.g., 10 minutes).
- 🚫 **File access audit trail** — `EDMS_FILE_DOWNLOADED` audit event on every presigned URL generation.
- 🚫 **Expired permission cleanup** — Cron job to mark expired `FilePermission` records as inactive.
- 🚫 **Folder move operation** — Moving a folder requires updating closure table entries; no dedicated `moveFolder()` method exists.
- 🚫 **File sharing rate limit** — No cap on how many positions a file can be shared with in a single request.

---

## Technical Debt

- 🧱 **`FileVersion` and `FileRecord` classification sync** — When a file's classification is updated, existing `FileVersion` records are not updated. Queries on versions may return stale classification.
- 🧱 **Folder depth enforced in application, not DB** — `MAX_FOLDER_DEPTH = 10` is checked in the service but not via a DB constraint or trigger.
- 🧱 **Hash computed in application layer** — SHA-256 is streamed during upload. If the hashing library produces a wrong result (e.g., stream interruption), the stored hash is wrong with no integrity verification on download.
- 🧱 **Closure table updates not transactional** — Inserting a new folder and updating the closure table happen in separate queries. A crash between them leaves a corrupt hierarchy.
- 🧱 **Presigned URL TTL hardcoded** — MinIO presigned URL expiry is likely hardcoded. Should be configurable per classification level (secret files = shorter TTL).

---

## Risks

- 🔓 **Malware delivery via async scan gap** — An attacker can upload an infected file and immediately share the download link before ClamAV flags it.
- 🔓 **Classification data leak on download** — No clearance check at download time (only at permission grant time). If a user's clearance is downgraded after being granted access, they can still download classified files.
- 🔓 **Expired permission grants persist** — Unauthorized access continues past the intended expiry window.
- 🔓 **Temp object data retention** — Failed upload temp files may contain sensitive data and accumulate indefinitely in MinIO, bypassing retention policies.

---

## Recommendations

- ✅ **Block downloads until scan completes:**
  ```typescript
  async generateDownloadUrl(fileId: string, actor: Actor): Promise<string> {
    const file = await this.filesRepo.findOneOrFail({ where: { id: fileId } });
    if (file.scanStatus !== ScanStatus.CLEAN) {
      throw new BadRequestException(`File is not available for download (scan status: ${file.scanStatus})`);
    }
    if (actor.clearance < file.classification) throw new ForbiddenException(...);
    // generate presigned URL
  }
  ```
- ✅ **Add scan timeout recovery cron:**
  ```typescript
  @Cron('*/10 * * * *')
  async requeueStaleScanJobs() {
    const staleFiles = await this.filesRepo.find({
      where: { scanStatus: ScanStatus.PENDING, createdAt: LessThan(subMinutes(new Date(), 10)) },
    });
    for (const file of staleFiles) {
      await this.scanQueue.add({ fileId: file.id });
    }
  }
  ```
- ✅ **Enforce `FilePermission.expires_at`** in `FilesService.assertPermission()`:
  ```typescript
  if (permission.expiresAt && permission.expiresAt < new Date()) {
    throw new ForbiddenException('File permission has expired');
  }
  ```
- ✅ **Audit download events:**
  ```typescript
  await this.auditService.emit({ eventType: 'FILE_DOWNLOADED', resourceId: fileId, actorId, ... });
  ```
- ✅ **MinIO lifecycle policy for tmp/ prefix** — Add a MinIO lifecycle rule: objects under `tmp/` older than 2 hours are automatically deleted.
- ✅ **Make presigned URL TTL classification-aware** — `secret` → 5 min, `confidential` → 15 min, `internal` → 1 hour, `unrestricted` → 24 hours.
