# Module: Chat & Calls

## Overview
**Chat** provides channel-based messaging with edit history, soft deletion, and presence tracking. **Calls** manages WebRTC session metadata (via Mediasoup SFU + Coturn STUN/TURN), call recordings with configurable retention, and scheduled/recurring calls.

---

## Current Issues

### Chat

- ❌ **Messages stored in plaintext** — Chat messages are persisted unencrypted. The audit trail exposes all message content to anyone with DB read access (DBAs, backup admins). For a government classified system, this is unacceptable.
- ❌ **No read receipts** — No tracking of whether a message was seen. Users have no delivery confirmation for critical operational communications.
- ❌ **No private/direct messaging** — Only group channels exist. DMs require a channel creation workaround, which is awkward for 1:1 operational communication.
- ❌ **Presence state may lag** — If the WebSocket connection drops without a clean close event, the user's presence stays `online` until the next heartbeat timeout. The timeout period is not defined.

### Calls

- ❌ **Recordings stored unencrypted** — Call recordings in MinIO are not encrypted at rest. A MinIO credential leak exposes all recordings.
- ❌ **No participant mute history** — `CallParticipant` tracks current state but not mute/unmute events over time. Required for incident post-mortems.
- ❌ **Recording retention cron is time-based, not classification-aware** — All recordings are deleted after `CALLS_RECORDING_RETENTION_CRON` days regardless of their classification level. Secret-classified calls may need longer retention; internal calls may need shorter.

---

## Missing Functionality

### Chat

- 🚫 **Message encryption at rest** — Application-level encryption (AES-256-GCM) for message content before persistence, with key management tied to classification level.
- 🚫 **Read receipts** — `MessageReadReceipt { messageId, userId, readAt }` entity + WebSocket push.
- 🚫 **Direct messages** — `ChannelType.DIRECT` with enforced two-participant limit and no broadcast.
- 🚫 **Message retention policy** — Configurable automatic deletion of messages older than N days per channel classification.
- 🚫 **Message search sync guarantee** — Background OpenSearch indexing can miss messages if the listener fails. A reconciliation job is needed.
- 🚫 **Presence heartbeat SLA** — Define and enforce maximum `online` presence stale time (e.g., mark offline after 90s without heartbeat).

### Calls

- 🚫 **Classification-aware recording retention** — `CallSession.classification` should drive the retention period, not a global config.
- 🚫 **Call duration aggregation** — Derived metric `callDurationSeconds` from `startTime` and `endTime` for analytics.
- 🚫 **Call participant mute event log** — `CallParticipantEvent { participantId, eventType: 'muted'|'unmuted'|'video_off', timestamp }`.
- 🚫 **Graceful SFU failover** — No fallback behavior documented if Mediasoup becomes unreachable.

---

## Technical Debt

- 🧱 **WebSocket gateway and REST controller overlap** — Some call/chat operations are available via both REST and WebSocket with duplicated validation logic. One should delegate to the other.
- 🧱 **`MessageEdit` is its own entity but `MessageEdit.content` is not validated** — Edits have no max length, profanity filter hookpoint, or moderation gateway.
- 🧱 **`CallRecording` entity references MinIO path directly** — Path construction logic is duplicated across recording creation, download, and deletion. Should be encapsulated in a `RecordingStorageService`.

---

## Risks

- 🔓 **Classified call content accessible via MinIO credentials** — Unencrypted recordings with an administrative MinIO access key bypasses all application-level authorization.
- 🔓 **Chat message content readable by DB admins** — Unencrypted storage violates the 4-layer classification model; DB admins effectively have unrestricted clearance.
- 🔓 **Stale presence causes ghost users** — Presence shown as online for disconnected users erodes trust in the presence feature.

---

## Recommendations

- ✅ **Encrypt message content at rest:**
  ```typescript
  // Before save:
  message.encryptedContent = await this.encryption.encrypt(plaintext, classificationKey);
  message.content = null; // never store plaintext
  // On read:
  message.content = await this.encryption.decrypt(message.encryptedContent, classificationKey);
  ```
- ✅ **Implement presence heartbeat cleanup:**
  ```typescript
  @Cron('*/30 * * * * *') // every 30 seconds
  async cleanupStalePresence() {
    await this.presenceRepo.update(
      { status: 'online', updatedAt: LessThan(subSeconds(new Date(), 90)) },
      { status: 'offline' },
    );
  }
  ```
- ✅ **Make recording retention classification-aware:**
  ```typescript
  const retentionDays = RETENTION_BY_CLASSIFICATION[session.classification] ?? defaultRetentionDays;
  const cutoff = subDays(new Date(), retentionDays);
  ```
- ✅ **Add `ChannelType.DIRECT`** — Enforce `participants.length === 2` in `createChannel()` and disallow `addMember()` for DIRECT channels.
- ✅ **Encrypt MinIO recordings** — Use MinIO server-side encryption (SSE-S3) or client-side encryption with per-session keys stored in HashiCorp Vault / KMS.
