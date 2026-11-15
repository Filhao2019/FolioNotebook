# Auto-Updater

Keeps the installed Folio desktop app up to date.

Each time Folio starts, it asks GitHub for the latest release of this
repository. If that release is newer, Folio downloads the file for this
computer in the background, checks it against GitHub's SHA-256 checksum, and
installs it when you quit Folio. The old version is removed; your notebooks
and settings are kept.

| System                | File downloaded               | How it is installed                          |
| --------------------- | ----------------------------- | -------------------------------------------- |
| Windows (x64)         | `Folio-Setup-X.Y.Z.exe`       | Runs silently                                |
| macOS (Apple, Intel)  | `Folio-X.Y.Z-mac-<arch>.zip`  | Replaces `Folio.app`                         |
| Ubuntu / Debian (x64) | `Folio-X.Y.Z-linux-amd64.deb` | `dpkg -i` through the system password dialog |

The AppImage and Arch (`pacman`) builds do not update themselves.

Nothing is installed unless it comes from this repository's releases and
matches the checksum. `update.js` holds the logic; `desktop/main.js` calls it.
