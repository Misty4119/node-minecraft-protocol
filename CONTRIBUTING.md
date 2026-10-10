# Contributing to node-minecraft-protocol

The package requires Node.js 22 or newer. The repository publishes `minecraft-protocol`; `src/version.js` is the supported-version list and `docs/README.md` is the canonical README.

## Protocol and data ownership

`minecraft-data` owns the editable protocol schema in `data/pc/<version>/proto.yml` and its generated `protocol.json`. Build and validate schema changes in the `minecraft-data` checkout first:

```sh
cd ../minecraft-data/tools/js
npm install
npm run build -- pc 26.3
npx mocha test/audit_pc_26_3.js --exit
npm test
```

In this repository, `src/datatypes/` owns ProtoDef runtime types and `src/transforms/serializer.js` owns version-specific protocol adaptation. Keep those behaviors behind the narrowest version or feature guard, and add round-trip and malformed-input coverage for wire-format changes. Do not hand-edit generated protocol data here.

## Checks

From this repository root:

```sh
npm install
npm run lint
npx mocha test/minecraft263SupportTest.js --exit
npm test
```

`npm test` runs the full Mocha suite; its `pretest` hook runs lint first. CI also runs the packet suite by each version in `src/version.js`. Keep every supported earlier version working when changing a shared datatype.

## Cross-repository updates

Merge a `minecraft-data` change before updating a dependent protocol change. Record and use the actual data merge commit SHA; do not treat an npm range, a branch name, or an unmerged commit as source provenance. CI builds `node-minecraft-data` against the selected `minecraft-data` merge SHA before running this repository's version matrix. Downstream PrismarineJS repositories should consume this repository only after its own checks pass and its merge SHA is available.

The current 26.3 CI data source is `minecraft-data` merge commit [`1d37505b338710f2f347aa00efaa48a054754b19`](https://github.com/Misty4119/minecraft-data/commit/1d37505b338710f2f347aa00efaa48a054754b19). Update that pin only after the next owning-repository data change has merged.
