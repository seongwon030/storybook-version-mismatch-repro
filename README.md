# `storybook build` fails when `storybook` is newer than `@storybook/builder-vite`

With `storybook@10.6.5` (any version >= 10.2.1) and `@storybook/builder-vite`,
`@storybook/react-vite`, `@storybook/react`, `@storybook/addon-docs` at `10.2.0`,
`storybook build` fails as soon as a `.storybook/preview.*` file exists. npm
installs this combination without a peer warning, because `@storybook/builder-vite@10.2.0`
declares `peerDependencies.storybook: "^10.2.0"`. `storybook doctor` flags the
mismatch, but `storybook build` / `storybook dev` never run that check, so the
user only sees a missing-file error from Rollup.

## Environment

- Node 22.12.0, npm 10.9.0
- macOS 26.6.2 (arm64); also see `.github/workflows/build.yml` for ubuntu-latest
- Versions are pinned exactly in `package.json` and `package-lock.json`

## Steps

```sh
npm ci
npm run build-storybook
```

## Actual

```
■  Vite ✗ Build failed in 755ms
│
■  Failed to build the preview
│
■  Could not resolve entry module
│  "node_modules/storybook/assets/server/mocker-runtime.template.js".
│  at getRollupError
│  (file://./node_modules/rollup/dist/es/shared/parseAst.js:337:41)
```

Exit code 1.

## Expected

Either the build works for every `storybook` version inside the declared peer
range (`^10.2.0`), or `storybook build` / `storybook dev` report the version
mismatch the same way `storybook doctor` does, instead of failing on an
internal file path.

## Control experiments

Each one makes the build pass (exit 0):

```sh
# 1. Remove the preview file
rm .storybook/preview.ts
npm run build-storybook

# 2. Align all Storybook packages with the core version
npm i -E @storybook/react-vite@10.6.5 @storybook/react@10.6.5 @storybook/builder-vite@10.6.5 @storybook/addon-docs@10.6.5
npm run build-storybook
```

## `storybook doctor` does detect it

```
▲  .storybook: 1 issue found
│ ┌─Mismatching Versions───────────────────────────────────────────────────────┐
│ │  Attention: There seems to be a mismatch between your Storybook package    │
│ │  versions. This can result in a broken Storybook installation.             │
│ │                                                                            │
│ │  The version of your storybook core packages should align with 10.6.5      │
│ │  (from the storybook package) or higher.                                   │
│ │                                                                            │
│ │  Based on your lockfile, these dependencies should be aligned:             │
│ │                                                                            │
│ │  @storybook/addon-docs: 10.2.0                                             │
│ │  @storybook/react-dom-shim: 10.2.0                                         │
│ │  @storybook/builder-vite: 10.2.0                                           │
│ │  @storybook/react-vite: 10.2.0                                             │
│ │  @storybook/react: 10.2.0                                                  │
```

## Root cause

`node_modules/@storybook/builder-vite/dist/preset.js` (10.2.0):

- `viteFinal` (lines 210-224) adds the `vite:storybook-inject-mocker-runtime`
  plugin only when `findConfigFile("preview", configDir)` finds a preview file.
  That is why removing `preview.ts` hides the problem.
- Build: `buildStart` (lines 42-52) calls `this.emitFile` with
  `join(resolvePackageDir("storybook"), "assets", "server", "mocker-runtime.template.js")`.
- Dev: `load` (lines 89-93) calls `readFileSync` on the same path.

`storybook@10.2.0` ships `assets/server/mocker-runtime.template.js`.
`storybook@10.2.1` and later do not; the runtime moved to the
`storybook/internal/mocking-utils/mocker-runtime` export
(`dist/mocking-utils/mocker-runtime.js`) as part of the hotfix for
storybookjs/storybook#33306. builder-vite 10.2.1 and later resolve
`import.meta.resolve("storybook/internal/mocking-utils/mocker-runtime")`
instead, but builder-vite 10.2.0 still hardcodes the old path while accepting
`storybook@^10.2.0` as a peer.

## Notes

- `storybook dev --ci --smoke-test` passes. In dev, the error only appears when
  the browser requests `/vite-inject-mocker-entry.js` (injected into
  `/iframe.html`):

  ```
  ■  Vite Internal server error: ENOENT: no such file or directory, open
  │  './node_modules/storybook/assets/server/mocker-runtime.template.js'
  │  at readFileSync (node:fs:441:20)
  │  at LoadPluginContext.load
  │  (file://./node_modules/@storybook/builder-vite/dist/preset.js:90:47)
  ```

- How this happens in practice: a Dependabot PR bumped only the `storybook`
  package (the other `@storybook/*` packages stayed at 10.2.0). `npm install`
  succeeded without warnings and the Storybook build in CI failed with the
  error above.
