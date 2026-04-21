//! Non-signature transforms enumerated in ADR-016.
//!
//! Each transform is in its own submodule so consumers can import a
//! single transform (`use sfx_dsp::transforms::gain::Gain;`) without
//! pulling the rest of the module tree.

pub mod gain;
