// @soundsafe/entitlement — Stripe + RS256-JWT entitlement client.
//
// startCheckout returns Promise<void> (resolves on entitlement update),
// not a Stripe URL — so the mobile shell can later substitute IAP without
// changing the interface (ADR-021).
//
// Implementation lands in M1.

export const __PACKAGE_NAME = '@soundsafe/entitlement';
