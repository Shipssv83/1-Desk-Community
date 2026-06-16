// Adapter contract — the single interface every external brain/system plugs in
// through. The dispatcher resolves an adapter by `provider` and calls the method
// matching the integration's `kind`. Adapters are pure: they take a context +
// message and return a normalized Result. They do NOT touch the DB, emit
// sockets, or send channel replies — that orchestration lives in the dispatcher.
//
// Context shape (ctx):
//   { orgId, integration, inbox, conversation, contact }
//   integration.credentials are DECRYPTED here (dispatcher uses getDecrypted).
//
// Inbound message shape:
//   { id, content, channelType, contactName }
//
// Normalized Result:
//   {
//     ok: boolean,
//     reply?: string,            // text to send back to the contact
//     conversationId?: string,   // upstream conversation id to persist (e.g. Dify)
//     actions?: object[],        // workflow actions (n8n)
//     qualification?: {          // lead qualification produced by the brain
//       score?: number, stage?: string, attributes?: object
//     },
//     raw?: any,
//     error?: string
//   }

function ok(partial = {}) {
  return { ok: true, ...partial };
}

function fail(error, partial = {}) {
  return { ok: false, error: String(error && error.message ? error.message : error), ...partial };
}

// Validates that an adapter module exposes the methods its kind requires.
function assertImplements(adapter, kind) {
  const brainKinds = ['agent', 'conversational', 'workflow'];
  if (brainKinds.includes(kind) && typeof adapter.handleInbound !== 'function') {
    throw new Error(`Adapter "${adapter.provider}" must implement handleInbound for kind "${kind}"`);
  }
  if (kind === 'crm' && typeof adapter.syncCrm !== 'function') {
    throw new Error(`Adapter "${adapter.provider}" must implement syncCrm for kind "${kind}"`);
  }
  return true;
}

module.exports = { ok, fail, assertImplements };
