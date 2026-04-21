//! The `Transform` trait — the audio-callback-safe surface every DSP node
//! implements. Per ADR-016 the trait is intentionally minimal; richer
//! capabilities (e.g. "also emits sidechain metadata") will arrive as
//! super-traits rather than by bloating this one.
//!
//! ## Contract
//!
//! - `prepare(sample_rate, max_block)` is called once before playback
//!   starts. Implementations may size internal state but must **not**
//!   allocate in the audio callback.
//! - `set_param(id, value, smoothing_ms)` is safe to call from the audio
//!   callback. Implementations must not allocate here either.
//!   `smoothing_ms` is advisory — transforms that don't smooth a given
//!   parameter may ignore it.
//! - `process(input, output)` writes exactly `min(input.len(), output.len())`
//!   samples. Allocation-free on every call.
//! - `reset()` returns internal state to the prepared state (e.g. resolves
//!   any in-flight parameter smoothing to the current target) without
//!   changing target values or sample rate.
//! - `id()` returns the stable transform identifier used in roadmap JSON
//!   per ADR-016. Never renamed after a transform ships.
pub trait Transform {
    /// Called once before playback starts. `max_block` is the largest
    /// block size the audio graph will pass to `process`.
    fn prepare(&mut self, sample_rate: u32, max_block: usize);

    /// Set a parameter by stable ID. `smoothing_ms` is how long the
    /// transform should take to ramp from the current value to the new
    /// target (advisory per transform).
    fn set_param(&mut self, id: u16, value: f32, smoothing_ms: u16);

    /// Apply the transform to `input`, writing the result into `output`.
    /// Writes `min(input.len(), output.len())` samples. Must not
    /// allocate.
    fn process(&mut self, input: &[f32], output: &mut [f32]);

    /// Snap any in-flight parameter smoothing to the current target.
    /// Called when the graph re-primes a step (e.g. on seek).
    fn reset(&mut self);

    /// Stable identifier used in roadmap JSON per ADR-016.
    fn id(&self) -> &'static str;
}
