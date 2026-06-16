const { getAdapter, listProviders } = require('../src/services/adapters');
const base = require('../src/services/adapters/baseAdapter');
const dispatcher = require('../src/services/dispatcher');

describe('Adapter contract', () => {
  test('every registered adapter satisfies its kind contract', () => {
    const providers = listProviders();
    expect(providers.length).toBeGreaterThan(0);
    for (const { provider, kind } of providers) {
      expect(() => base.assertImplements(getAdapter(provider), kind)).not.toThrow();
    }
  });

  test('registry exposes the expected providers/kinds', () => {
    const map = Object.fromEntries(listProviders().map((p) => [p.provider, p.kind]));
    expect(map.dify).toBe('conversational');
    expect(map.flowise).toBe('conversational');
    expect(map.hermes).toBe('agent');
    expect(map.n8n).toBe('workflow');
    expect(map.seatable).toBe('crm');
  });

  test('unknown provider resolves to null', () => {
    expect(getAdapter('does-not-exist')).toBeNull();
  });

  test('assertImplements throws when a brain adapter lacks handleInbound', () => {
    expect(() => base.assertImplements({ provider: 'x' }, 'agent')).toThrow();
  });

  test('assertImplements throws when a crm adapter lacks syncCrm', () => {
    expect(() => base.assertImplements({ provider: 'x' }, 'crm')).toThrow();
  });

  test('ok/fail normalize results', () => {
    expect(base.ok({ reply: 'hi' })).toEqual({ ok: true, reply: 'hi' });
    expect(base.fail('boom')).toMatchObject({ ok: false, error: 'boom' });
    expect(base.fail(new Error('exploded')).error).toBe('exploded');
  });
});

describe('Route selection', () => {
  test('maps camelCase inbox fields to a route plan', () => {
    const r = dispatcher.selectRoute({
      agentIntegrationId: 'a', workflowIntegrationId: 'w',
      crmIntegrationId: 'c', routingPolicy: { mode: 'x' }
    });
    expect(r).toEqual({ agentId: 'a', workflowId: 'w', crmId: 'c', policy: { mode: 'x' } });
  });

  test('falls back to snake_case and nulls', () => {
    const r = dispatcher.selectRoute({ agent_integration_id: 'a' });
    expect(r.agentId).toBe('a');
    expect(r.workflowId).toBeNull();
    expect(r.crmId).toBeNull();
    expect(r.policy).toEqual({});
  });
});
