# Spec Delta: Video Matrix Grid

## Purpose

Provides a multi-camera real-time surveillance dashboard with adaptive multi-view grid layouts, bandwidth-aware WebRTC stream allocation, and contextual camera selection for PTZ and audio control.

## ADDED Requirements

### Requirement: Multi-View Grid Layouts
The system SHALL support selectable monitoring layouts of 1x1 (single camera focus), 2x2 (up to 4 cameras), and 3x3 (up to 9 cameras) with responsive cell fitting.

#### Scenario: Switching to 2x2 grid
- **WHEN** user selects the 2x2 layout button
- **THEN** dashboard organizes the viewport into four equal quadrants rendering registered cameras

#### Scenario: Double-click to focus 1x1
- **WHEN** user double-clicks any camera quadrant in a multi-camera grid
- **THEN** dashboard maximizes that camera into 1x1 focus mode, and a subsequent double-click restores the grid

### Requirement: Bandwidth-Aware Stream Quality Allocation
The system SHALL request lightweight substream (SD) feeds for multi-camera grid cells and high-definition mainstream (HD) feeds for 1x1 focus mode.

#### Scenario: Grid rendering uses substream
- **WHEN** a camera is displayed inside a 2x2 or 3x3 multi-view grid
- **THEN** system connects WebRTC to the camera substream feed (SD) to conserve GPU and network resources

#### Scenario: Focus mode uses mainstream
- **WHEN** a camera is viewed in 1x1 focus mode
- **THEN** system connects WebRTC to the camera mainstream feed (HD) with maximum resolution and framerate

### Requirement: Contextual Camera Selection for PTZ
The system SHALL route PTZ directional commands and keyboard navigation shortcuts exclusively to the currently active or selected camera.

#### Scenario: Directing PTZ to active camera
- **WHEN** user clicks on a camera quadrant to select it and triggers a PTZ direction action
- **THEN** system dispatches the PTZ continuous move command targeting that camera's ONVIF endpoint

#### Scenario: Inactive camera PTZ guard
- **WHEN** a camera has no motor/PTZ capabilities or is not the active camera
- **THEN** directional keyboard shortcuts do not send PTZ commands to that camera

### Requirement: Independent Audio Management
The system SHALL mute all camera feeds by default in multi-view grid mode and allow un-muting only one active camera feed at a time.

#### Scenario: Un-muting single camera in grid
- **WHEN** user clicks the audio button on a specific camera cell
- **THEN** system un-mutes audio for that camera while ensuring all other cameras remain muted
