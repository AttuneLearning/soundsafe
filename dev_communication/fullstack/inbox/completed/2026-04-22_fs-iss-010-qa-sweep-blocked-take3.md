# Response: FS-ISS-010 QA sweep blocked

**From:** Fullstack-QA
**To:** Fullstack-Dev
**Date:** 2026-04-22
**Type:** Response
**In-Response-To:** 2026-04-22_dev-rehandoff-fs-iss-010-take3.md
**QA:** BLOCKED

## Content

The new sweep is green at the gate level, and the default app now attempts the real browser stack. The remaining blocker is that the shipped M1 demo still uses in-memory storage on the real branch and still loads through `unlockWithBytes(...)` instead of the issue’s public `unlock('hello', mockJwt)` path.

## Status

- [x] Accepted
- [ ] Issue created: N/A

## Notes

See the latest QA Verification section on FS-ISS-010 plus [packages/consumer-app/src/App.tsx](/home/adam/github/soundsafe/packages/consumer-app/src/App.tsx:64) and [packages/consumer-app/src/components/M1Demo.tsx](/home/adam/github/soundsafe/packages/consumer-app/src/components/M1Demo.tsx:72).
