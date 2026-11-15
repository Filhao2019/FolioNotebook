# Instructions for AI agents

## Every release ships installers for all three platforms

Each Folio release must have a Windows, a macOS and a Linux installer attached to
its GitHub Release. Never publish, or call a release done, with any of them missing.

| Platform | Files on the release                                                             |
| -------- | -------------------------------------------------------------------------------- |
| Windows  | `Folio-Setup-<version>.exe`                                                      |
| macOS    | `Folio-<version>-mac-arm64.dmg/.zip`, `Folio-<version>-mac-x64.dmg/.zip`         |
| Linux    | `Folio-<version>-linux-x86_64.AppImage`, `-linux-amd64.deb`, `-linux-x64.pacman` |

The auto-updater (`Auto-Updater/update.js`, `assetName`) looks for these exact
names. A missing file means users on that platform never get the update.

### How to release

1. Set the new version in `package.json` (`"version"`). The app reads its version
   from there, so nothing else needs changing. Commit it as `Release x.y.z` on `main`.
2. Create a tag named `vx.y.z` (with the `v`) on that commit, for example through
   **Releases → Draft a new release** on GitHub, targeting `main`.
   Tags without the `v` do not start the installer build.
3. The `Desktop installers` workflow (`.github/workflows/desktop.yml`) then builds
   on Windows, macOS and Linux and uploads every file to the release.
4. Check that the workflow passed for all three platforms and that all 8 files
   above are attached. If a platform's build fails, fix it and rebuild; do not
   leave the release with that platform missing.

If you change the build (the matrix in `desktop.yml`, the `build` section of
`package.json`, or file names), keep all three platforms building and keep the
file names matching `assetName` in `Auto-Updater/update.js`.
