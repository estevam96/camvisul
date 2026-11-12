# Camera Management Specification

## Purpose

Enables the system to configure, persist, and manage heterogeneous IP cameras across multiple manufacturers with automatic connection validation and stream resolution.

## Requirements

### Requirement: Camera Configuration Persistence
The system SHALL persist camera configurations in a local SQLite database, preserving connection parameters across application restarts without leaking secrets to version control.

#### Scenario: Camera saved to SQLite
- **WHEN** user submits a new camera configuration with valid name, IP, ports, and credentials
- **THEN** system saves the camera record in SQLite and returns a unique camera identifier

#### Scenario: Existing camera updated
- **WHEN** user updates camera details such as name, IP, ports, or password
- **THEN** system persists changes in SQLite and updates the corresponding stream definitions

### Requirement: Manufacturer Presets and Port Mapping
The system SHALL provide configuration presets for supported camera manufacturers and maintain distinct port mappings for RTSP streaming and ONVIF device management.

#### Scenario: Manufacturer preset applied
- **WHEN** user selects a manufacturer preset such as Intelbras, Hikvision, Tapo, or Besder
- **THEN** system pre-populates the default RTSP port and manufacturer-specific ONVIF port

#### Scenario: Custom or generic camera configured
- **WHEN** user configures a generic camera without ONVIF support
- **THEN** system accepts custom RTSP stream paths with an optional or null ONVIF port

### Requirement: Credential and Stream Validation
The system SHALL validate camera network reachability and authentication before finalizing registration.

#### Scenario: Connection test succeeds
- **WHEN** user requests a connection test for provided camera IP and credentials
- **THEN** system verifies RTSP authentication and device reachability, returning an online status

#### Scenario: Authentication fails
- **WHEN** user provides invalid credentials or unreachable network address
- **THEN** system returns an explicit authentication error message without saving an invalid state

### Requirement: Encrypted Password Storage at Rest
The system SHALL encrypt all camera passwords using authenticated symmetric encryption (AES-256-GCM) before storing them in the SQLite database, and SHALL NEVER expose plaintext passwords in camera listing API responses.

#### Scenario: Password encrypted before database write
- **WHEN** user saves or updates a camera with a new password
- **THEN** system encrypts the password with a unique initialization vector and stores the ciphertext in SQLite

#### Scenario: Camera list requested via API
- **WHEN** client requests the camera list from the API
- **THEN** system returns camera metadata with passwords masked or omitted, indicating only whether a password is set

#### Scenario: Decrypting credentials for internal stream setup
- **WHEN** streaming engine initializes an RTSP connection to a camera
- **THEN** system decrypts the stored ciphertext in memory to authenticate with the camera without exposing the secret to the client

### Requirement: Automatic Environment Migration
The system SHALL automatically import legacy single-camera environment credentials into SQLite on initial launch if no cameras currently exist.

#### Scenario: Initial setup with existing environment variables
- **WHEN** application boots with legacy DEFAULT_CAMERA_IP in environment and an empty camera database
- **THEN** system automatically creates a default camera record populated from environment variables

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
