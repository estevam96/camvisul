# Design: Multi-Camera VMS & Real-Time Grid Monitoring

## Context

See `proposal.md` for background and user motivation.
Currently, `src/server.js` maintains a single in-memory `currentSession` strictly tailored to a Besder/Xiongmai camera. The streaming engine `go2rtc` manages low-latency WebRTC streams via its REST API (`/api/streams` and `/api/webrtc`). To evolve into a VMS monitoring platform, the system must abstract camera-specific assumptions, store multiple camera definitions locally, and orchestrate independent WebRTC peer connections in a multi-camera grid.

## Goals / Non-Goals

**Goals:**
- Provide a robust local SQLite persistence layer (`data/camvisul.db`) for camera CRUD operations.
- Dynamically register and unregister streams (`cam_<id>_main` and `cam_<id>_sub`) in `go2rtc` without restarting the process.
- Support heterogeneous IP camera brands (Besder, Intelbras, Dahua, Hikvision, Tapo, Generic ONVIF/RTSP) with prefilled port presets.
- Build a responsive multi-camera surveillance grid supporting 1x1, 2x2, and 3x3 layouts.
- Optimize client GPU and network bandwidth by streaming Substream (SD) in grid view and Mainstream (HD) in focus mode.
- Contextually route PTZ commands and keyboard shortcuts to the currently active camera.

**Non-Goals:**
- Remote multi-user authentication or cloud database synchronization (deferred to subsequent changes).
- Continuous 24/7 video recording or NVR file storage to local disk.
- Computer vision analytics or motion detection algorithms.

## Decisions

### 1. Persistence via Local SQLite Database
- **Choice:** Use SQLite with a local file at `data/camvisul.db` (auto-created and ignored in `.gitignore`).
- **Rationale:** SQLite provides ACID transactions, zero-config embedded operation, schema migrations, and avoids corrupting flat JSON files on simultaneous writes.
- **Alternatives Considered:** Flat JSON file (`cameras.json`). Rejected due to lack of concurrent write safety and difficulty scaling to future relational entities (e.g., event logs, PTZ presets).

### 2. Dual-Port Schema (`rtsp_port` and `onvif_port`)
- **Choice:** Explicitly store `rtsp_port` (default 554) and `onvif_port` (nullable, default based on brand).
- **Rationale:** A physical IP camera runs two distinct services simultaneously: RTSP for video on port 554 and ONVIF HTTP/SOAP for PTZ on port 8899/80/8000/2020.
- **Alternatives Considered:** Single generic `port` column. Rejected because it cannot represent two concurrent communication channels on the same IP address.

### 3. Dynamic Stream Naming Convention (`cam_<id>_main` / `cam_<id>_sub`)
- **Choice:** Register streams in `go2rtc` using predictable patterns: `cam_${id}_main` for high-resolution feeds and `cam_${id}_sub` for low-resolution feeds.
- **Rationale:** Avoids naming clashes, allows on-demand WebRTC negotiation via `/api/webrtc?src=cam_${id}_${quality}`, and leverages go2rtc's native lazy streaming (camera stream is only pulled from network when at least one viewer is active).

### 4. Adaptive Bandwidth & GPU Quality Switching
- **Choice:** In 2x2 and 3x3 layouts, cells automatically connect to the `sub` (SD) stream. When a user double-clicks or selects 1x1 mode, the player switches to the `main` (HD) stream.
- **Rationale:** Decoding four or nine 1080p H.264 streams concurrently causes high CPU/GPU load in browser processes and Wi-Fi congestion. Substreams typically consume < 200 kbps each, allowing seamless 9-camera playback.

### 5. Contextual Active Camera for PTZ and Audio
- **Choice:** Keep a single "Active Camera" state in the frontend. Clicking any cell marks it active (visually highlighted with an accent border). The PTZ panel and arrow keys target the active camera only. Only the active camera can have audio enabled.
- **Rationale:** Eliminates visual clutter from floating D-pads on each cell and prevents audio feedback cacophony from multiple microphones.

### 6. Authenticated Symmetric Password Encryption (AES-256-GCM)
- **Choice:** Encrypt camera passwords using `node:crypto` AES-256-GCM with a machine secret key (`data/.secret.key` or `APP_SECRET_KEY`) and a 12-byte random IV per row.
- **Rationale:** IP cameras require the original password to compute RFC 2617 Digest MD5 challenge responses. One-way hashing (bcrypt/SHA-256) is fundamentally incompatible with RTSP Digest Auth. AES-256-GCM provides authenticated encryption at rest without third-party dependencies.
- **Alternatives Considered:** Plaintext in SQLite (rejected: insecure if database file is inspected), One-way hash (rejected: breaks RTSP authentication).

## Risks / Trade-offs

- **[Risk: Multiple simultaneous RTSP streams overloading camera Wi-Fi]**
  - *Mitigation:* All RTSP URLs registered in go2rtc enforce `#transport=tcp#backchannel=0` to eliminate UDP packet loss. In grid mode, only substreams are requested.
- **[Risk: Camera offline during startup blocks registration]**
  - *Mitigation:* Registration in go2rtc is asynchronous; go2rtc connects to the RTSP source lazily upon browser request, so offline cameras do not block server initialization.
- **[Risk: Accidental exposure of camera passwords in repository]**
  - *Mitigation:* `data/camvisul.db` and any `.db` files are added to `.gitignore`. API responses for camera listings omit sensitive plaintext passwords unless editing.

## Migration Plan

1. Create `src/db.js` initializing `data/camvisul.db` and creating the `cameras` table if it does not exist.
2. In `src/server.js`, check if `cameras` table is empty; if empty and legacy environment variables (`DEFAULT_CAMERA_IP`, `DEFAULT_CAMERA_USER`, etc.) are defined, auto-insert the legacy camera as the first record.
3. Keep backward-compatible aliases for single-camera WebRTC requests if necessary during transition.
