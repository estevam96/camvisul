# Proposal: Camera Discovery and Dynamic IP Auto-Healing

## Why

In residential and commercial Wi-Fi camera setups, cameras routinely receive different IP addresses via DHCP after power outages, reboots, or router renegotiations. When this happens, existing camera registrations break, rendering streams and PTZ controls unavailable until the user manually checks the router and updates configurations. Furthermore, onboarding new cameras currently requires manual entry of IP addresses and ports. Implementing network discovery and dynamic IP auto-healing restores broken camera connections transparently without user intervention and enables one-click camera onboarding.

## What Changes

- **Network Discovery Engine**: Implement a lightweight local network scanner using native Node.js UDP sockets (`dgram`) supporting both ONVIF WS-Discovery (multicast UDP `239.255.255.250:3702`) and Xiongmai/ICSee NetIP broadcast (UDP `34569`).
- **Hardware Fingerprint Persistence**: Extend SQLite camera schema with immutable hardware identifiers (`mac_address` and `serial_number`) populated automatically during registration or initial connection.
- **Dynamic IP Auto-Healing**: When a stream connection fails or an periodic watchdog detects an unreachable camera, trigger an asynchronous network probe, match the camera by its immutable MAC/serial, update the IP in SQLite, refresh go2rtc stream sources, and seamlessly resume playback.
- **Discovery API Endpoint**: Add `GET /api/discovery` to discover and list all available IP cameras on the local network.
- **Frontend Discovery UI**: Add a "Buscar Câmeras na Rede" action in the camera management modal to auto-detect and populate camera parameters with one click.

## Capabilities

### New Capabilities
- `camera-discovery`: Scans local network segments using WS-Discovery and NetIP UDP probes, collecting responsive camera endpoints, device models, MAC addresses, and service ports.

### Modified Capabilities
- `camera-management`: Extends camera persistence to record immutable hardware fingerprints (`mac_address`, `serial_number`) and adds autonomous dynamic IP auto-healing when a registered camera's network location changes.

## Impact

- **Database**: Adds `mac_address` and `serial_number` columns to the `cameras` table in SQLite (`src/db.js`).
- **Backend**: New module `src/discovery.js` using Node.js `dgram`; new endpoint `GET /api/discovery` and auto-healing integration in `src/server.js`.
- **Streaming**: Dynamic stream source update via `go2rtc` API when camera IP changes without requiring server restart.
- **Frontend**: Discovery modal trigger and auto-fill in `public/index.html` and `public/js/app.js`.
