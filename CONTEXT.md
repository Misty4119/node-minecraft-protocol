# node-minecraft-protocol repository context

## Purpose and package boundary

This repository publishes the CommonJS package minecraft-protocol (version 1.68.0 in the current tree). It parses and serializes Minecraft packets and provides client/server transports, authentication helpers, encryption, compression, and protocol debugging. The package entry point is src/index.js and declarations are in src/index.d.ts. Node.js 22 or newer is required by package.json.

The current default protocol version is 26.3. The supported list, including legacy versions back to 1.7, is the exact list in src/version.js. Do not infer support from a README table alone.

## Source map

- src/index.js exports the public API and version metadata.
- src/createClient.js and src/createServer.js expose high-level constructors.
- src/client.js and src/server.js implement connection state, authentication, encryption, compression, framing, and packet events.
- src/datatypes/ contains ProtoDef-compatible Minecraft data types and version-sensitive serializers.
- src/transforms/ contains framing, compression, encryption, and stream transforms.
- src/version.js is the version support declaration.
- test/ contains packet, cycle, client, server, limit, and version-specific regression tests.
- docs/README.md and docs/API.md are the canonical user documentation.
- root README.md is generated from docs/README.md by npm run prepublishOnly and is intentionally ignored.

## Data and compatibility flow

minecraft-data supplies packet schema and registry metadata. node-minecraft-protocol loads the version-selected protocol definition and maps it through serializers and transforms. The client and server layers then apply connection state, authentication, encryption, compression, and resource limits.

A protocol edit can affect all state transitions (handshaking, status, login, configuration, and play), both directions, compression on/off, and older versions. Keep a change local to the capability that differs and use feature checks or explicit version gates rather than changing legacy behavior globally.

Java 26.2 uses protocol 776 and Java 26.3 uses protocol 777 in the current data corpus. 26.3 is the default version. The 26.3 entityDelta type supports legacy and stepped movement deltas; its packet definitions and tests are version-specific.

## Testing model

The Mocha suite includes packet and cycle round trips, client/server integration, version-specific 26.3 coverage, packet-size limits, and authentication-related paths. Run npm test for the complete lint-plus-Mocha check. Use npm run mochaTest with a focused grep when iterating on one area. Avoid external accounts in tests; use offline fixtures or local servers where possible.

## Generated and external files

The protocol schema is owned by minecraft-data. Do not silently vendor or hand-edit generated protocol files in this repository. The src/client/*.json path is ignored because generated client data is environment-specific. versions/ is ignored and may contain downloaded server metadata. Keep these paths out of commits unless a documented release process requires otherwise.

## Security-sensitive behavior

Packet length prefixes, decompression output, authentication/session responses, encryption keys, and server credentials are trust boundaries. maxPacketSize must bound both declared and actual frame/decompressed output. Error paths must close streams and avoid logging secrets. See SECURITY.md for reporting and disclosure.

## Downstream dependencies

mineflayer uses this package for bot connections and local development links may point at the sibling checkout. Keep public packet names and version guards compatible with prismarine-item, prismarine-chunk, prismarine-physics, and minecraft-data. Coordinate a schema change across those repositories when it changes item components, entity movement, chunk data, or version metadata.


## Published versus local source

The current source includes 26.2 and 26.3 changes after the published 1.68.0 release. A standalone npm install therefore cannot be used as evidence for this fork's latest protocol behavior. Mineflayer validation uses adjacent sibling checkouts and its vendor/minecraft-data snapshot; record those commits when reproducing a result.
