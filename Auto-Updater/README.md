# Auto-Updater

Keeps the installed Folio desktop app up to date.

Folio asks GitHub for this repository's releases when it starts and again
every six hours. What happens next depends on **Settings → Folio version →
Update automatically**:

- **Yes** (the default): Folio downloads the newest release in the
  background, checks it against GitHub's SHA-256 checksum, and installs it
  when you quit Folio.
- **No**: Folio still checks, but installs nothing by itself. When newer
  releases exist, a **New update** button appears in the top bar (with a
  count when there is more than one). It opens a list of every release that
  can be installed, newest first, with its release notes; with one release
  there is one entry. **Install** downloads that release, checks it, closes
  Folio, installs it and opens Folio again.

The choice is saved in `desktop.json` (`"autoUpdate": false` for No) in
Folio's settings folder. Turning automatic updates off also cancels an update
that was waiting for Folio to quit. Either way the old version is removed;
your notebooks and settings are kept.

| System                | File downloaded               | How it is installed                           |
| --------------------- | ----------------------------- | --------------------------------------------- |
| Windows (x64)         | `Folio-Setup-X.Y.Z.exe`       | Runs silently                                 |
| macOS (Apple, Intel)  | `Folio-X.Y.Z-mac-<arch>.zip`  | Replaces `Folio.app` and re-signs it (ad-hoc) |
| Ubuntu / Debian (x64) | `Folio-X.Y.Z-linux-amd64.deb` | `dpkg -i` through the system password dialog  |

The AppImage and Arch (`pacman`) builds do not update themselves; there the
switch is shown turned off and greyed out. Drafts and pre-releases are never
offered.

On macOS the replaced bundle is stripped of the quarantine flag and signed ad-hoc, because the
app is not notarized; the new version is reopened only after `codesign --verify` passes.

Nothing is installed unless it comes from this repository's releases and
matches the checksum. `update.js` holds the logic; `desktop/main.js` runs the
checks and installs, and `desktop/app-preload.cjs` gives the Folio window
only these update controls.
