//! `Clock` abstraction used by the roadmap engine.
//!
//! The engine itself does not touch audio — it consults a monotonically
//! increasing sample count. In production, [`SampleCounterClock`] is
//! incremented by the audio graph once per processed block. In tests,
//! [`FakeClock`] lets us advance time deterministically.

/// Monotonically increasing sample count. Implementations must be
/// non-decreasing across calls.
pub trait Clock {
    fn processed_samples(&self) -> u64;
}

/// Production clock: driven by the audio graph.
#[derive(Debug, Default, Clone)]
pub struct SampleCounterClock {
    samples: u64,
}

impl SampleCounterClock {
    pub const fn new() -> Self { Self { samples: 0 } }

    /// Called by the audio graph once per processed block.
    pub fn advance(&mut self, frames: u32) {
        self.samples = self.samples.saturating_add(frames as u64);
    }
}

impl Clock for SampleCounterClock {
    fn processed_samples(&self) -> u64 { self.samples }
}

/// Test clock. Does not exist on the audio thread in production.
#[derive(Debug, Default, Clone)]
pub struct FakeClock {
    samples: u64,
}

impl FakeClock {
    pub const fn new() -> Self { Self { samples: 0 } }

    pub fn advance_samples(&mut self, n: u64) {
        self.samples = self.samples.saturating_add(n);
    }

    pub fn set_samples(&mut self, n: u64) {
        self.samples = n;
    }
}

impl Clock for FakeClock {
    fn processed_samples(&self) -> u64 { self.samples }
}
