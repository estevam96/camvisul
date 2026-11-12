# Tasks: Camera Discovery and Dynamic IP Auto-Healing

## 1. Database Migration and Hardware Fingerprint Storage

- [x] 1.1 Add `mac_address` and `serial_number` columns and query methods to `src/db.js` and verify with unit tests in `test/db.test.js`
- [x] 1.2 Implement automatic fingerprint extraction via ONVIF/NetIP upon successful connection in `src/server.js` and verify fingerprint persistence in SQLite

## 2. Local Network Discovery Engine

- [x] 2.1 Implement `src/discovery.js` with native Node.js `dgram` UDP sockets for ONVIF WS-Discovery and Xiongmai NetIP probes, and verify with `test/discovery.test.js`
- [x] 2.2 Implement `GET /api/discovery` in `src/server.js` returning normalized camera candidates and verify endpoint response contract via automated test

## 3. Autonomous Dynamic IP Auto-Healing

- [x] 3.1 Implement camera IP matching and auto-healing routine that updates SQLite and go2rtc stream definitions upon matching MAC or serial number, and verify with unit tests
- [x] 3.2 Integrate reactive connection failure hook and periodic health check timer in `src/server.js` with cooldown protection against probe storms

## 4. Frontend UI for Network Discovery and Seamless Reconnect

- [x] 4.1 Add "Buscar Câmeras na Rede" action and discovery results dialog in `public/index.html` and `public/css/style.css`
- [x] 4.2 Implement 1-click pre-fill of registration form from discovered camera list and silent stream reconnect watchdog in `public/js/app.js`

## 5. End-to-End Verification

- [x] 5.1 Create `test/e2e-discovery.test.js` validating discovery scan, fingerprint persistence, and dynamic IP auto-healing end-to-end
