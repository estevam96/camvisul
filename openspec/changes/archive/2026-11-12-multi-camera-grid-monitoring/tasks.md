# Tasks: Multi-Camera VMS & Real-Time Grid Monitoring

## 1. SQLite Storage & Camera Repository

- [x] 1.1 Implement `src/crypto.js` with AES-256-GCM authenticated encryption/decryption and machine secret key loader (`data/.secret.key` / `APP_SECRET_KEY`), verifying round-trip encryption with unit tests.
- [x] 1.2 Create `src/db.js` initializing `data/camvisul.db` with the `cameras` table and update `.gitignore` to exclude `.db` and `.secret.key` files. Verify database file creation and table structure.
- [x] 1.3 Implement camera CRUD repository functions (`getAllCameras`, `getCameraById`, `createCamera`, `updateCamera`, `deleteCamera`) in `src/db.js` with transparent password encryption and masked API projection, verified with automated tests.
- [x] 1.4 Implement legacy environment credential auto-migration in `src/db.js` so existing single-camera setups automatically seed the database with encrypted passwords on initial boot.

## 2. Manufacturer Presets & Dynamic Stream Engine

- [x] 2.1 Implement `src/camera-presets.js` containing manufacturer default ports (RTSP 554, ONVIF 8899/80/8000/2020) and stream path generators for Besder, Intelbras, Dahua, Hikvision, Tapo, and Generic RTSP.
- [x] 2.2 Enhance `src/go2rtc-manager.js` with methods to register (`registerCameraStreams(camera)`) and unregister (`unregisterCameraStreams(cameraId)`) both mainstream and substream feeds.
- [x] 2.3 Implement RESTful camera API routes in `src/server.js` (`GET /api/cameras`, `POST /api/cameras`, `PUT /api/cameras/:id`, `DELETE /api/cameras/:id`, `POST /api/cameras/:id/test`, `POST /api/cameras/:id/ptz`) and verify with integration tests.

## 3. Frontend Multi-View Grid & Camera Management

- [x] 3.1 Update `public/index.html` and `public/css/style.css` to include the VMS top bar (1x1, 2x2, 3x3 selectors), dynamic multi-camera CSS grid container, and native `<dialog>` for camera management.
- [x] 3.2 Implement camera management UI in `public/js/app.js` (camera list, add/edit camera form with automatic preset port pre-filling, and delete confirmation).
- [x] 3.3 Implement WebRTC multi-player controller in `public/js/app.js` capable of maintaining independent peer connections per grid cell with automatic Substream (SD) in grid view and Mainstream (HD) in 1x1 mode.

## 4. Contextual PTZ & Audio Interaction

- [x] 4.1 Implement active camera selection logic in `public/js/app.js` (clicking a grid cell highlights it and directs keyboard arrow shortcuts and PTZ panel commands to that specific camera).
- [x] 4.2 Implement single-camera audio toggle in grid view, ensuring that un-muting one camera automatically mutes all other video feeds to avoid audio conflicts.
- [x] 4.3 Perform end-to-end verification of multi-camera streaming, layout switching (1x1, 2x2, 3x3), double-click zoom, and contextual PTZ control.
