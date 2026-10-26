# TiviLoom

IPTV player for LG webOS and Android mobile.

## Project status

The source import and device builds are **not yet complete**. This repository will use the user's TiviLoom 0.6.6 source archive as the migration baseline after security review. Do not treat this README as a working app release.

## Non-negotiable requirements

- Keep the current logo, branding and splash screen unchanged.
- **Do not autoplay preview when a channel receives focus**. A change of focus must not initiate a stream.
- Preserve working features; audit before modifying or replacing them.
- Fix player freezes, errors and navigation/focus issues, including group long-OK actions and QR import.
- Release LG webOS **`.ipk`** and Android **mobile `.apk`** together from the same tested commit and version.
- Test both platforms; report build and device-test status separately.
- Do not commit signing keys, secrets, account credentials, local environment files, or stale build binaries to source control.

## Release acceptance criteria

1. All automated tests pass.
2. Web bundle and Android mobile APK build from current source.
3. LG webOS IPK builds from current source.
4. Artifact versions match the code version and each other.
5. A release manifest contains hashes, test evidence and installation guidance.
6. A package is not marked device-tested until tested on physical hardware.

## Planned source import

Review the `TiviLoom-GitHub-Ready-Source.zip` archive and remove generated artifacts, local signing files and temporary work directories before committing the source. The existing 0.6.6 workflow is the starting point, not proof of successful release.
