# Camera Discovery Specification

## Purpose

Enables automated discovery of active IP cameras on local network segments using standard ONVIF WS-Discovery and Xiongmai NetIP protocols to simplify device onboarding.

## Requirements

### Requirement: Local Network Camera Scanning
The system SHALL broadcast network discovery probes using ONVIF WS-Discovery (multicast UDP 239.255.255.250:3702) and Xiongmai NetIP (broadcast UDP 34569) to identify reachable cameras within 2 seconds.

#### Scenario: Network scan initiated
- **WHEN** client requests discovery scan via the API
- **THEN** system dispatches UDP discovery probes across local network interfaces and collects matching camera responses within a 2000ms window

#### Scenario: No cameras detected on network
- **WHEN** discovery probe window closes without receiving responses
- **THEN** system returns an empty camera list with an explicit success indicator

### Requirement: Discovered Camera Profile Normalization
The system SHALL parse heterogeneous discovery responses into a uniform camera descriptor including IP address, RTSP port, ONVIF port, manufacturer, and immutable hardware identifiers (MAC address or serial number).

#### Scenario: ONVIF camera response parsed
- **WHEN** an ONVIF WS-Discovery probe response is received
- **THEN** system extracts the service endpoint XAddrs, resolves the device IP, and identifies the ONVIF port and device UUID

#### Scenario: Xiongmai NetIP camera response parsed
- **WHEN** a Xiongmai NetIP search response is received
- **THEN** system extracts IP, port 34567, hardware MAC address, and device serial number

### Requirement: One-Click Discovery Onboarding
The system SHALL allow users to import any discovered camera into the registration form with pre-populated network parameters.

#### Scenario: Discovered camera selected for registration
- **WHEN** user chooses a discovered camera from the scan list
- **THEN** registration modal pre-fills camera name, IP, ports, and detected manufacturer preset
