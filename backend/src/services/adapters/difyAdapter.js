const fetch = require('node-fetch');
const { ok, fail } = require('./baseAdapter');

// Dify conversational adapter. Streams chat-messages SSE and reassembles the
// answer + upstream conversation_id. Config/credentials:
//   credentials.api_key   (required)  Dify app API key
//   config.api_url        (required)  e.g. https://dify.example.com/v1/chat-messages
function readStream(stream) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let answer = '';
    let conversationId = '';
    let error = null;
    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const events = buffer.split('\n\n');
      buffer = events.pop();
      for (const evt of events) {
        const dataLine = evt.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.conversation_id) conversationId = parsed.conversation_id;
          if (parsed.event === 'message' || parsed.event === 'agent_message') answer += parsed.answer || '';
          else if (parsed.event === 'error') error = parsed.message || 'Unknown Dify error';
        } catch { /* ignore non-JSON SSE lines */ }
      }
    });
    stream.on('end', () => resolve({ answer, conversationId, error }));
    stream.on('error', reject);
  });
}

async function handleInbound(ctx, message) {
  const { integration, conversation, contact } = ctx;
  const apiUrl = integration.config.api_url || integration.credentials.api_url;
  const apiKey = integration.credentials.api_key;
  if (!apiUrl || !apiKey) return fail('Dify integration missing api_url/api_key');

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: { channel: message.channelType, contact_name: contact.name || 'User' },
        query: message.content,
        response_mode: 'streaming',
        conversation_id: conversation.difyConversationId || conversation.dify_conversation_id || '',
        user: contact.externalId || contact.external_id
      })
    });
    if (!res.ok) return fail(`Dify responded ${res.status}: ${await res.text()}`);

    const { answer, conversationId, error } = await readStream(res.body);
    if (error) return fail(error);
    return ok({ reply: (answer || '').trim(), conversationId });
  } catch (err) {
    return fail(err);
  }
}

module.exports = { provider: 'dify', kind: 'conversational', handleInbound };
