# Security policy

## Scope

minecraft-protocol parses data received from remote servers and exposes authentication, encryption, compression, and client/server transports. Security issues may cause denial of service, memory exhaustion, request smuggling between protocol states, credential or session-token disclosure, unsafe logging, or unintended connection behavior.

## Supported versions

There is no formal long-term security-support matrix for this fork. Security triage starts with the current master branch and the latest published package. The protocol compatibility list in src/version.js remains the compatibility target; older Minecraft versions are not a promise of separate security maintenance. Java 26.2 (protocol 776) and 26.3 (protocol 777) are current version-specific targets, with 26.3 as the default.

## Reporting a vulnerability

As verified on 2026-09-19, this fork has no enabled GitHub private vulnerability-reporting endpoint. Do not file a public issue, discussion, pull request, or chat message containing exploit details.

1. Check the repository GitHub **Security** tab for **Report a vulnerability** and use the private form if it is available.
2. Otherwise use a private contact method listed on the [Misty4119 GitHub profile](https://github.com/Misty4119). If none is available, request a private route without describing the vulnerability publicly, then send the details privately.
3. Redact Microsoft/Mojang tokens, session responses, encryption keys, passwords, packet captures containing personal data, and private server addresses.

Include the affected version and commit, connection state, packet or input needed to reproduce, impact, environment, and a minimal safe reproduction. Do not send real account credentials. Please allow maintainers to coordinate disclosure before publishing details; no response or remediation time is promised.

For non-security protocol bugs, use the [public issue tracker](https://github.com/Misty4119/node-minecraft-protocol/issues) with secrets removed.
