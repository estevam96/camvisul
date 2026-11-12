# Spec Delta: Camera Management

## ADDED Requirements

### Requirement: Immutable Hardware Fingerprint Storage
The system SHALL store immutable hardware identifiers, specifically MAC address and device serial number, for each registered camera in the local SQLite database.

#### Scenario: Hardware fingerprint recorded on initial connection
- **WHEN** camera connects successfully or is saved from discovery
- **THEN** system queries device identification services and persists MAC address and serial number in the database record

#### Scenario: Existing camera updated with missing fingerprint
- **WHEN** an existing camera without stored hardware identifiers connects successfully
- **THEN** system updates the database row with retrieved MAC address and serial number without modifying user credentials

### Requirement: Autonomous Dynamic IP Auto-Healing
The system SHALL automatically detect and resolve IP address changes for registered cameras using background discovery probes when connection failures occur or during periodic health checks.

#### Scenario: Camera IP updated after DHCP lease renewal
- **WHEN** a registered camera fails to connect due to host reachability error and is rediscovered on a new IP matching its stored MAC or serial number
- **THEN** system updates the camera IP in SQLite, reconfigures the go2rtc stream definition, and resumes streaming without requiring user intervention

#### Scenario: Periodic health check detects offline camera
- **WHEN** periodic lightweight health check detects an unreachable camera
- **THEN** system triggers asynchronous network discovery to locate the device by its hardware fingerprint
