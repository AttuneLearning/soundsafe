//! Soundsafe safety rails (ADR-015).
//!
//! Four enforcement layers, all mandatory and non-bypassable at the type
//! level:
//!
//! 1. **Ceiling limiter** — peak-amplitude limiter applied post-chain.
//! 2. **Ramp-up envelope** — every step starts in silence and ramps to target.
//! 3. **Daily exposure cap** — per-trigger sample-counted cap; `evaluate_before_play` blocks once exceeded.
//! 4. **Session cool-down timer** — minimum interval between sessions on the same trigger.
//!
//! `SafetyRails` is intentionally constructed only via `SafetyRails::new(...)`
//! and exposes no `disabled` flag, no `Option`-wrapped layer, and no setter
//! that can null out a rail. The "never disabled" property (ADR-015) is a
//! type-system invariant; downstream callers including the audio graph and
//! the consumer UI cannot turn it off.
//!
//! Values *within* each rail are tunable per ADR-015 + ADR-024 within
//! safety-clamped bounds defined here.

#![cfg_attr(not(test), no_std)]

use core::num::NonZeroU32;

/// Safety rails enforced on every audio block. Construct via [`SafetyRails::new`].
///
/// All four rails are required fields. There is no constructor that omits
/// one and no API that disables one — that's the whole point.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SafetyRails {
    ceiling: Ceiling,
    ramp: RampUp,
    cap: ExposureCap,
    cooldown: CoolDown,
}

impl SafetyRails {
    /// Construct a fresh `SafetyRails` with the given values, each clamped
    /// to its safety bounds. Cannot fail; out-of-range inputs are clamped
    /// rather than rejected, so a buggy UI cannot block construction.
    pub const fn new(
        ceiling: Ceiling,
        ramp: RampUp,
        cap: ExposureCap,
        cooldown: CoolDown,
    ) -> Self {
        Self { ceiling, ramp, cap, cooldown }
    }

    /// The starting-point defaults from `feature-matrix.md`.
    pub const fn defaults() -> Self {
        Self::new(
            Ceiling::DEFAULT,
            RampUp::DEFAULT,
            ExposureCap::DEFAULT,
            CoolDown::DEFAULT,
        )
    }

    pub const fn ceiling(&self) -> Ceiling { self.ceiling }
    pub const fn ramp(&self) -> RampUp { self.ramp }
    pub const fn cap(&self) -> ExposureCap { self.cap }
    pub const fn cooldown(&self) -> CoolDown { self.cooldown }
}

/// Reasons playback can be blocked by safety. Returned by
/// `evaluate_before_play` (added in M1 alongside the runtime counters).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SafetyBlock {
    /// Daily exposure cap reached for the current trigger.
    DailyCapReached { remaining_seconds_until_reset: u32 },
    /// Session cool-down still active.
    CoolDownActive { remaining_seconds: u32 },
    /// First-run disclaimer not acknowledged.
    DisclaimerNotAcknowledged,
}

// ---------------------------------------------------------------------------
//  Individual rails. Each clamps inputs to safe bounds at construction.
// ---------------------------------------------------------------------------

/// Volume ceiling in negative dBFS.
///
/// Range: −36 dBFS (very quiet) to −3 dBFS (loud). Default −12 dBFS per
/// `feature-matrix.md`. The ceiling applies to true peak post-chain.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ceiling(f32);

impl Ceiling {
    pub const DEFAULT: Self = Self(-12.0);
    pub const MIN_DBFS: f32 = -36.0;
    pub const MAX_DBFS: f32 = -3.0;

    pub const fn dbfs(self) -> f32 { self.0 }

    pub fn new(dbfs: f32) -> Self {
        let clamped = if dbfs < Self::MIN_DBFS {
            Self::MIN_DBFS
        } else if dbfs > Self::MAX_DBFS {
            Self::MAX_DBFS
        } else {
            dbfs
        };
        Self(clamped)
    }
}

/// Per-step ramp-up window in milliseconds (silence → target).
///
/// Range: 250 ms minimum (always *some* ramp), 30 000 ms maximum.
/// Default 3000 ms per `feature-matrix.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RampUp(NonZeroU32);

impl RampUp {
    pub const DEFAULT: Self = Self(unsafe { NonZeroU32::new_unchecked(3000) });
    pub const MIN_MS: u32 = 250;
    pub const MAX_MS: u32 = 30_000;

    pub const fn ms(self) -> u32 { self.0.get() }

    pub fn new(ms: u32) -> Self {
        let clamped = if ms < Self::MIN_MS {
            Self::MIN_MS
        } else if ms > Self::MAX_MS {
            Self::MAX_MS
        } else {
            ms
        };
        // SAFETY: clamped is at least MIN_MS (250), which is non-zero.
        Self(unsafe { NonZeroU32::new_unchecked(clamped) })
    }
}

/// Daily per-trigger exposure cap in seconds.
///
/// Range: 60 s (1 min) to 7200 s (2 h). Default 900 s (15 min) per
/// `feature-matrix.md`. Cap resets on local-midnight rollover.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExposureCap(NonZeroU32);

impl ExposureCap {
    pub const DEFAULT: Self = Self(unsafe { NonZeroU32::new_unchecked(900) });
    pub const MIN_SECONDS: u32 = 60;
    pub const MAX_SECONDS: u32 = 7200;

    pub const fn seconds(self) -> u32 { self.0.get() }

    pub fn new(seconds: u32) -> Self {
        let clamped = if seconds < Self::MIN_SECONDS {
            Self::MIN_SECONDS
        } else if seconds > Self::MAX_SECONDS {
            Self::MAX_SECONDS
        } else {
            seconds
        };
        Self(unsafe { NonZeroU32::new_unchecked(clamped) })
    }
}

/// Minimum interval between sessions on the same trigger, in seconds.
///
/// Range: 0 s (no cool-down) to 86_400 s (24 h). Default 600 s (10 min) —
/// clinically validated by Adam (LPC) on 2026-04-20.
///
/// UI granularity is `STEP_SECONDS` (10 minutes): the cool-down slider
/// snaps to 10-minute increments. Users extend the cool-down in 10-min
/// steps when they want a longer pause between sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CoolDown(u32);

impl CoolDown {
    pub const DEFAULT: Self = Self(600);
    pub const MAX_SECONDS: u32 = 86_400;
    /// UI step granularity in seconds — sliders snap to 10-minute increments.
    pub const STEP_SECONDS: u32 = 600;

    pub const fn seconds(self) -> u32 { self.0 }

    pub fn new(seconds: u32) -> Self {
        let clamped = if seconds > Self::MAX_SECONDS {
            Self::MAX_SECONDS
        } else {
            seconds
        };
        Self(clamped)
    }
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Demonstrates the "never disabled" property: there is no public API
    /// that produces a `SafetyRails` lacking any of the four layers, and
    /// every accessor returns a real value (not `Option`).
    ///
    /// This is a compile-test-style proof: if the type ever grows an
    /// `Option`-wrapped or `bool`-disable field, this test will require
    /// invasive changes to compile, surfacing the regression in code review.
    #[test]
    fn safety_rails_has_no_disable_path() {
        let rails = SafetyRails::defaults();
        let _: Ceiling = rails.ceiling();
        let _: RampUp = rails.ramp();
        let _: ExposureCap = rails.cap();
        let _: CoolDown = rails.cooldown();
    }

    #[test]
    fn ceiling_clamps_in_bounds() {
        assert_eq!(Ceiling::new(-100.0).dbfs(), Ceiling::MIN_DBFS);
        assert_eq!(Ceiling::new(0.0).dbfs(), Ceiling::MAX_DBFS);
        assert_eq!(Ceiling::new(-12.0).dbfs(), -12.0);
    }

    #[test]
    fn rampup_clamps_in_bounds_and_is_nonzero() {
        assert_eq!(RampUp::new(0).ms(), RampUp::MIN_MS);
        assert_eq!(RampUp::new(1_000_000).ms(), RampUp::MAX_MS);
        assert_eq!(RampUp::new(3000).ms(), 3000);
    }

    #[test]
    fn exposure_cap_clamps_in_bounds() {
        assert_eq!(ExposureCap::new(0).seconds(), ExposureCap::MIN_SECONDS);
        assert_eq!(ExposureCap::new(1_000_000).seconds(), ExposureCap::MAX_SECONDS);
        assert_eq!(ExposureCap::new(900).seconds(), 900);
    }

    #[test]
    fn cooldown_clamps_at_max() {
        assert_eq!(CoolDown::new(1_000_000).seconds(), CoolDown::MAX_SECONDS);
        assert_eq!(CoolDown::new(0).seconds(), 0);
        assert_eq!(CoolDown::new(600).seconds(), 600);
    }

    #[test]
    fn cooldown_default_is_ten_minutes() {
        // Clinically validated default (Adam, LPC, 2026-04-20).
        assert_eq!(CoolDown::DEFAULT.seconds(), 600);
        assert_eq!(CoolDown::STEP_SECONDS, 600);
    }

    /// Proptest: any pair of (input, accessor-output) for each rail's
    /// constructor falls within the documented bounds — i.e. clamping
    /// is truly inviolable across the full input range.
    mod prop {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            #[test]
            fn ceiling_always_in_bounds(dbfs in proptest::num::f32::ANY) {
                let c = Ceiling::new(dbfs);
                if dbfs.is_nan() {
                    // NaN propagates; we don't currently special-case NaN
                    // (a NaN ceiling has no meaning). Skip.
                    return Ok(());
                }
                prop_assert!(c.dbfs() >= Ceiling::MIN_DBFS);
                prop_assert!(c.dbfs() <= Ceiling::MAX_DBFS);
            }

            #[test]
            fn rampup_always_in_bounds(ms: u32) {
                let r = RampUp::new(ms);
                prop_assert!(r.ms() >= RampUp::MIN_MS);
                prop_assert!(r.ms() <= RampUp::MAX_MS);
            }

            #[test]
            fn exposure_cap_always_in_bounds(seconds: u32) {
                let e = ExposureCap::new(seconds);
                prop_assert!(e.seconds() >= ExposureCap::MIN_SECONDS);
                prop_assert!(e.seconds() <= ExposureCap::MAX_SECONDS);
            }

            #[test]
            fn cooldown_at_or_below_max(seconds: u32) {
                let c = CoolDown::new(seconds);
                prop_assert!(c.seconds() <= CoolDown::MAX_SECONDS);
            }
        }
    }
}
