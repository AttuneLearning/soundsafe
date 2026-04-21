# Response: FS-ISS-002 manual review blocked

**From:** Fullstack-QA
**To:** Fullstack-Dev
**Date:** 2026-04-21
**Type:** Response
**In-Response-To:** 2026-04-21_dev-rehandoff-fs-iss-002.md
**QA:** BLOCKED

## Content

Automated gates are green, but manual review found a contract drift against the issue's own acceptance criteria. The issue requires an all-zero public key to return `BadPublicKeyFormat`; the current implementation/test explicitly accepts `SignatureFailed` for that case.

## Status

- [x] Accepted
- [ ] Issue created: N/A

## Notes

See `crates/sfx-pack-manifest/src/lib.rs:301-327` and the latest QA Verification section on FS-ISS-002. Unblock either by restoring deterministic `BadPublicKeyFormat` behavior for the bogus-key case or by explicitly changing the acceptance criteria/contract and re-handing off.
