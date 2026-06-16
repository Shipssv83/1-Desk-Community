// Community edition: no plans, no seat/usage limits, no billing. These are
// intentionally no-op stubs so route guards and the organization endpoint keep
// working without a paywall. Self-hosters get everything, unlimited.

// Always within limit — never throws.
async function assertWithinLimit(/* db, org, resource */) {
  return true;
}

// No plan caps in the community edition.
function getEffectiveLimits(/* org */) {
  return {};
}

module.exports = {
  assertWithinLimit,
  getEffectiveLimits
};
