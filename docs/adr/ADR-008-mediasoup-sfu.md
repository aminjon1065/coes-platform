# ADR-008: MediaSoup SFU for Real-Time Audio/Video

**Date:** 2026-02-10
**Status:** Accepted
**Deciders:** Platform Architecture Team

---

## Context

Emergency coordination requires real-time audio/video conferencing for incident command. The platform must support:
- Multi-party calls (incident command room: 10–30 participants)
- Screen sharing for map/document collaboration
- Recording for after-action review
- Secure on-premises operation (no WebRTC TURN relay through external cloud)

WebRTC topologies:
| Topology | Description | Pros | Cons |
|---|---|---|---|
| Mesh (P2P) | Every peer connects to every other | No server media processing | O(n²) uplink; degrades at 4+ participants |
| MCU (Multipoint Control Unit) | Server decodes all streams and re-encodes a composite | Low client bandwidth | Extreme server CPU; transcoding latency |
| SFU (Selective Forwarding Unit) | Server forwards streams selectively; no decode/re-encode | Low server CPU; scalable to 50+ | Clients receive multiple streams |

## Decision

**MediaSoup 3.x SFU** in a dedicated extracted service (`apps/media`).

## Rationale

**SFU is the right topology for emergency command rooms:**

In a 15-person incident command call, mesh topology would require each participant to upload their stream 14 times. On constrained government LAN/WAN links (50–100 Mbps shared), this is not viable. SFU routes each participant's stream through the server once (upload), and the server forwards it to all subscribers (download from server). Client uplink = 1× regardless of participant count.

**MediaSoup over Jitsi/BigBlueButton:**

Jitsi and BBB are full-stack WebRTC platforms with their own signalling servers, UIs, and operational overhead. MediaSoup is a low-level SFU library — we own the signalling layer completely, which allows:
- Custom authentication (JWT-gated room join)
- Integration with the existing call session management API (`CallsService`)
- Embedding security clearance checks (participants must hold `calls:join` permission for the given department)

**Why an extracted service?**

MediaSoup's C++ worker processes must be forked from a Node.js process that has direct control over UDP sockets. Running this inside the NestJS monolith container would:
1. Require `hostNetwork: true` on the monolith pod (a significant security surface expansion)
2. Bind RTP/RTCP port ranges (40000–49999) on the same pod as the HTTP API
3. Make the entire monolith dependent on media-layer stability (a crash in the media worker process could affect all other modules)

The extracted `apps/media` service runs in its own pod with `hostNetwork: true` and pod anti-affinity (`requiredDuringScheduling` by `kubernetes.io/hostname`) to ensure RTP ports are spread across nodes.

**TURN/STUN:**

Coturn 4.6 is deployed in the media profile for NAT traversal. Long-term credentials (lt-cred-mech) with a shared secret are generated per-call session and expire after the call ends. This prevents credential abuse for external TURN relay.

## Architecture

```
Browser/Mobile ←──── DTLS/SRTP ────→ MediaSoup Worker (UDP 40000-49999)
                                            ↕ (signalling)
                                      SignalingHandler (WS)
                                            ↕
                                      RabbitMQ ←→ Backend CallsService
```

The signalling layer (join, produce, consume, transport setup) uses WebSocket messages routed via RabbitMQ to the backend. The backend `CallsService` manages session state (active participants, recording status) in PostgreSQL.

## Consequences

- MediaSoup worker pool size is configured by `MEDIASOUP_WORKERS` env var (default: `os.cpus().length`). Each worker handles one CPU core; RTP processing is single-threaded per worker.
- The media pod anti-affinity rule means each Kubernetes node can host at most one media pod. This caps horizontal scaling at the number of nodes. For CoESCD's scale (< 100 concurrent calls), this is acceptable.
- RTP port range (40000–49999) must be opened on the host firewall and any network ACLs between the media host and client networks.
- Recording is implemented via MediaSoup's `PlainTransport` piping the RTP stream to FFmpeg running in a sidecar container.
