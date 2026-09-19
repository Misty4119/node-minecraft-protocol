@AGENTS.md

Load [CONTEXT.md](CONTEXT.md) before protocol or version work and [SECURITY.md](SECURITY.md) before touching auth, encryption, packet captures, or resource limits. The canonical user documentation is [docs/README.md](docs/README.md); the root README is generated and ignored.

Keep src/version.js, minecraft-data protocol definitions, serializers, transforms, TypeScript declarations, and tests in sync. Node.js 22 or newer is required. Do not put tokens or private packet data in fixtures or logs.
