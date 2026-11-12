# Design: Network Camera Discovery and Dynamic IP Auto-Healing

## Context

CamVisul currently stores cameras with static IP configurations in SQLite. When cameras restart in typical Wi-Fi setups, DHCP lease reassignments result in unreachable stream endpoints (`connect: host is down`). See `proposal.md` for motivation.

CamVisul has access to:
- Node.js native `dgram` for UDP broadcast and multicast without external packages.
- ONVIF SOAP client (`src/onvif-client.js`) capable of querying `GetDeviceInformation` (hardware ID, serial number).
- SQLite repository (`src/db.js`) managing camera state.
- `go2rtc` REST API (`/api/streams`) for dynamic stream source updates.

## Goals / Non-Goals

**Goals:**
- Provide a zero-external-dependency discovery module (`src/discovery.js`) leveraging Node.js native `dgram`.
- Send dual-mode discovery probes: ONVIF WS-Discovery (multicast UDP `239.255.255.250:3702`) and Xiongmai NetIP (broadcast UDP `34569`).
- Persist immutable hardware fingerprints (`mac_address`, `serial_number`) in the SQLite `cameras` table.
- Implement an autonomous, silent auto-healing routine that detects IP changes upon stream connection failures or periodic checks and dynamically updates SQLite and go2rtc.
- Provide a responsive `GET /api/discovery` REST endpoint and frontend discovery modal to onboard newly detected cameras in 1 click.

**Non-Goals:**
- Configuring router DHCP settings or modifying router reservation tables.
- Modifying camera network configurations (static IP assignment on the camera side).
- Scanning wide-area networks or non-local subnets (discovery remains strictly on local broadcast/multicast boundaries).

## Decisions

### 1. Dual-Protocol UDP Discovery (WS-Discovery + Xiongmai NetIP)
- **Rationale**: ONVIF WS-Discovery covers heterogeneous camera brands (Intelbras, Dahua, Hikvision, Tapo, Besder), while Xiongmai NetIP discovery provides instant access to MAC address, serial number, and firmware version on ICSee/Besder devices.
- **Alternatives Considered**:
  - *Full subnet TCP port sweep*: Slower (requires testing 254 IPs individually), high CPU/network overhead.
  - *ARP cache reading only*: Relies on OS-level ARP cache entries which expire and don't provide ONVIF port information.

### 2. Matching Strategy: Immutable Hardware Fingerprints
- **Rationale**: A camera's IP and port may change, but its MAC address and manufacturer serial number remain constant.
- **Matching Priority**:
  1. Exact match on `mac_address`.
  2. Exact match on `serial_number` or ONVIF device UUID.
  3. Fallback: verification of credentials via ONVIF `GetDeviceInformation` if fingerprints were previously missing.
- **Alternatives Considered**:
  - *Hostname matching*: Many consumer IP cameras do not broadcast an mDNS or NetBIOS hostname.

### 3. Silent Auto-Healing Lifecycle
- **Rationale**: User monitoring should not be disrupted by modal alerts when a camera reboots.
- **Lifecycle**:
  1. Stream connection error (`500` or dial error from go2rtc) triggers `handleCameraConnectionFailure(cameraId)`.
  2. Asynchronous discovery probe is dispatched (with a debounce guard to prevent probe storms).
  3. If discovered device matches camera hardware fingerprint with a new IP:
     - SQLite is updated: `UPDATE cameras SET ip = ?, updated_at = datetime('now') WHERE id = ?`.
     - `go2rtc` stream source is updated via `POST /api/streams?src=...`.
     - Frontend watchdog seamlessly reconnects to the stream.

### 4. Database Schema Migration
- **Rationale**: Add columns safely without breaking existing records.
- **Implementation**:
  ```sql
  ALTER TABLE cameras ADD COLUMN mac_address TEXT;
  ALTER TABLE cameras ADD COLUMN serial_number TEXT;
  ```
  Executed inside `initDatabase()` wrapped in try/catch or column existence check.

## Risks / Trade-offs

- **[Risk] Multicast blocked by Wi-Fi AP Isolation or Managed Switches**  
  → *Mitigation*: Dual probes (NetIP broadcast uses `255.255.255.255` which penetrates many consumer APs where multicast is dropped). Fallback to directed probe on previously known subnet range if discovery yields 0 results.

- **[Risk] Probe Storms during sustained camera outage**  
  → *Mitigation*: Implement cooldown timers (minimum 30s interval between auto-healing scans for the same camera) and max retry caps.

- **[Risk] Initial camera registration lacks MAC address**  
  → *Mitigation*: On the first successful connection to any camera, the server automatically queries `getDeviceInformation()` and populates `mac_address` and `serial_number` into SQLite.

## Migration Plan

1. Existing SQLite databases will receive the new `mac_address` and `serial_number` columns automatically during app startup without data loss.
2. Active cameras without fingerprints will be backfilled with hardware metadata on their next connection.
