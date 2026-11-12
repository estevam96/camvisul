# Proposal: Multi-Camera VMS & Real-Time Grid Monitoring

## Why

Currently, CamVisul supports only a single Besder/Xiongmai camera session hardcoded in memory, preventing users from connecting multiple cameras or using devices from other manufacturers. To operate like a real video monitoring system (VMS/CFTV), users need to configure and persist multiple IP cameras regardless of brand, monitor them concurrently in a multi-view grid (1x1, 2x2, 3x3) with low latency, and control PTZ and audio contextually on the active camera.

## What Changes

- **Multi-Brand Camera Configuration & SQLite Storage**:
  - Add local SQLite storage (`data/camvisul.db`) to persist camera configurations across restarts safely.
  - Implement authenticated symmetric encryption (AES-256-GCM) via `src/crypto.js` to store all camera passwords encrypted at rest using a machine secret (`data/.secret.key` or `APP_SECRET_KEY`), with masked password display on frontend APIs.
  - Implement brand presets (Besder, Intelbras, Dahua, Hikvision, TP-Link Tapo, Generic ONVIF/RTSP) with prefilled ports (`rtsp_port` 554, `onvif_port` 8899/80/8000/2020) and automatic ONVIF discovery.
  - Automatic migration of existing single-camera environment credentials into SQLite on first launch.
- **RESTful Camera Management API**:
  - Endpoints to list, create, update, delete, test connection, and send PTZ commands per camera ID (`/api/cameras`).
- **Dynamic Multi-Stream Registration in go2rtc**:
  - Dynamically register and manage separate mainstream (`cam_<id>_main`) and substream (`cam_<id>_sub`) feeds for each camera in the go2rtc core.
- **Multi-Camera Grid Dashboard (1x1, 2x2, 3x3)**:
  - Add responsive CSS grid layouts (1x1 focus mode, 2x2 four-camera grid, 3x3 nine-camera grid).
  - Bandwidth & GPU optimization: grid cells stream lightweight Substream (SD), while 1x1 focus mode streams Mainstream (HD 1080p).
  - Double-click cell to toggle between grid and full 1x1 focus.
- **Contextual PTZ & Audio**:
  - Click any grid cell to set it as the "Active Camera", directing keyboard shortcuts and PTZ panel controls exclusively to that camera.
  - Per-cell audio un-mute toggle ensuring only one camera plays audio at any time.

## Capabilities

### New Capabilities
- `camera-management`: Storage in SQLite, CRUD API, manufacturer presets, credential validation, and stream resolution for heterogeneous IP cameras.
- `video-matrix-grid`: Real-time multi-camera dashboard supporting 1x1, 2x2, and 3x3 grid layouts, WebRTC lifecycle management with SD/HD bandwidth switching, and contextual camera selection for PTZ and audio.

### Modified Capabilities
<!-- No pre-existing capability specs in openspec/specs/ -->

## Impact

- **Backend**:
  - SQLite integration (`data/camvisul.db` created and added to `.gitignore`).
  - Refactored `src/server.js` to route requests by camera ID instead of a global `currentSession`.
  - Refactored `src/go2rtc-manager.js` to handle dynamic multi-stream registration and removal.
- **Frontend**:
  - Updated `public/index.html`, `public/js/app.js`, and `public/css/style.css` to render camera list, layout switchers (1x1, 2x2, 3x3), dynamic grid cells with independent WebRTC players, and camera management modals.
- **Dependencies**:
  - Embedded SQLite driver or Node standard SQLite module.
