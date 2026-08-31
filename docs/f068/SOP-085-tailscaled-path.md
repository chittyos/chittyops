---
uri: chittycanon://docs/ops/sop/085-tailscaled-binary-path
namespace: chittycanon://docs/ops
type: sop
sop_id: SOP-085
version: 1.0.0
status: PROPOSED
related_fix: F-068
generated: 2026-05-27
---

# SOP-085 — Accepted Paths for `tailscaled` Binary

**Status:** Proposed (no prior SOP-085 located in `/home/ubuntu/.ops` or any chitty repo as of audit). This document proposes the SOP de novo. If a prior version exists in a system not yet inventoried, this proposal should be reconciled with it.

## Problem

Verification on `chittyserv-vm` (2026-05-27) confirmed:

- `tailscale` CLI: `/usr/bin/tailscale` (Tailscale 1.98.3, commit `a16e0f20cff0acd5617fd1b315df32cdad17a8fa`)
- `tailscaled` daemon binary: `/usr/sbin/tailscaled` (38 MB, installed 2026-05-21)
- Systemd unit: `/usr/lib/systemd/system/tailscaled.service` — `ExecStart=/usr/sbin/tailscaled ...`
- Enabled: `/etc/systemd/system/multi-user.target.wants/tailscaled.service` (active)

The reviewing tooling appears to expect `tailscaled` at `/usr/local/bin/tailscaled`. That path is **not present** on Debian/Ubuntu installations using the official Tailscale apt repository (`pkgs.tailscale.com`), which deploy the daemon to `/usr/sbin/`. On macOS Homebrew installs, the binary may live under `/usr/local/bin/` or `/opt/homebrew/bin/`.

## Resolution

This SOP defines the **set of accepted `tailscaled` binary paths** for ChittyOS-managed hosts. Any path in the set is canonical; tooling MUST accept all of them.

### Accepted paths

| Path | Platform | Source |
|---|---|---|
| `/usr/sbin/tailscaled` | Debian / Ubuntu / RHEL | Official `pkgs.tailscale.com` apt/yum repo |
| `/usr/local/bin/tailscaled` | macOS (Intel Homebrew), some manual installs | Homebrew `tailscale` formula (`/usr/local/Cellar/.../bin/tailscaled` → symlink) |
| `/opt/homebrew/bin/tailscaled` | macOS (Apple Silicon Homebrew) | Homebrew on `arm64` |
| `/usr/bin/tailscaled` | Some minimal distros, container images | Distro package |

Tooling that locates the daemon binary MUST search this list in order and accept the first hit. Hard-coding any single path is non-conformant.

### Reference implementation

```bash
tailscaled_path() {
  for p in /usr/sbin/tailscaled /usr/local/bin/tailscaled /opt/homebrew/bin/tailscaled /usr/bin/tailscaled; do
    [ -x "$p" ] && { echo "$p"; return 0; }
  done
  return 1
}
```

```python
def tailscaled_path() -> str | None:
    for p in ("/usr/sbin/tailscaled", "/usr/local/bin/tailscaled", "/opt/homebrew/bin/tailscaled", "/usr/bin/tailscaled"):
        if os.access(p, os.X_OK):
            return p
    return None
```

## Systemd unit path

Independent of the binary path, the systemd unit may live at one of:

- `/usr/lib/systemd/system/tailscaled.service` (vendor-shipped, preferred)
- `/etc/systemd/system/tailscaled.service` (operator-overridden — must take precedence)
- `/lib/systemd/system/tailscaled.service` (older Debian)

Verification SHOULD use `systemctl cat tailscaled` to resolve the active unit rather than hard-coding the file path.

## Acceptance criteria for this SOP

1. Verification tooling (whatever raised the path issue against `chittyserv-vm`) updated to use the accepted-paths set.
2. Hosts where `/usr/sbin/tailscaled` is the active install pass verification.
3. macOS hosts where `/usr/local/bin/tailscaled` (Intel) or `/opt/homebrew/bin/tailscaled` (Apple Silicon) is the active install pass verification.
4. This SOP is registered under `chittycanon://docs/ops/sop/085-tailscaled-binary-path`.

## Classification

| Step | Class |
|---|---|
| Author this SOP | SAFE_REPO ✅ done |
| Update verification tooling to use accepted-paths set | SAFE_REPO — wherever the tooling lives; identify and fix in a follow-up |
| Register SOP-085 with chittycanon | NEEDS_APPROVAL — registry mutation gated |

## Provenance

Raised during F-068 cleanup verification on 2026-05-27. The reviewer flagged that this VM does not have `tailscaled` at the expected `/usr/local/bin/tailscaled` path; investigation confirmed the binary lives at the distro-canonical `/usr/sbin/tailscaled` and that no prior SOP-085 existed. Authoring this SOP closes the gap.
