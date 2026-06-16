// Adapter registry. Community edition ships a single AI brain: Dify. Adding a new
// integration = drop an adapter module here; the dispatcher and routing never
// change (open/closed). Each adapter declares its own `provider` and `kind`.
const adapters = [
  require('./difyAdapter')
];

const byProvider = new Map(adapters.map((a) => [a.provider, a]));

function getAdapter(provider) {
  return byProvider.get(provider) || null;
}

function listProviders() {
  return adapters.map((a) => ({ provider: a.provider, kind: a.kind }));
}

module.exports = { getAdapter, listProviders };
