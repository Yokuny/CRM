import { TOOL_DEFINITIONS } from '@crm/ai-kit';
import { TENANT_FORBIDDEN_KEYS } from '@crm/contracts';
import { describe, expect, it } from 'vitest';

// AD-010: nenhum input_schema de tool pode carregar tenant/canal/conversa —
// esses dados sempre vêm do ToolContext do servidor. TENANT_FORBIDDEN_KEYS
// (contracts) cobre a família "tenant"; channelId/conversationId são
// específicos desta feature (AIG-14) e não fazem parte daquela lista.
const EXTRA_FORBIDDEN_KEYS = ['channelid', 'conversationid'];

const findForbiddenKeys = (properties: Record<string, unknown>): string[] => {
  const keys = Object.keys(properties).map((key) => key.toLowerCase());
  return keys.filter(
    (key) => (TENANT_FORBIDDEN_KEYS as readonly string[]).includes(key) || EXTRA_FORBIDDEN_KEYS.includes(key),
  );
};

const EXPECTED_TOOL_NAMES = ['get_process_template', 'find_or_create_customer', 'open_process', 'set_process_fields'];

describe('Anel A tool input_schema structural guard (AD-010, AIG-14/40)', () => {
  it('self-check: the sweep flags a synthetic input_schema containing a tenant field', () => {
    const offending = findForbiddenKeys({ tenant: { type: 'string' }, key: { type: 'string' } });

    expect(offending).toEqual(['tenant']);
  });

  it('self-check: the sweep flags a synthetic input_schema containing channelId/conversationId', () => {
    const offending = findForbiddenKeys({ channelId: { type: 'string' }, conversationId: { type: 'string' } });

    expect(offending.sort()).toEqual(['channelid', 'conversationid']);
  });

  it('TOOL_DEFINITIONS has exactly 4 entries with the fixed Anel A names', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(4);
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual(EXPECTED_TOOL_NAMES);
  });

  it.each(TOOL_DEFINITIONS)('$name input_schema contains no forbidden tenant/channel/conversation key', (tool) => {
    const offending = findForbiddenKeys(tool.input_schema.properties);

    expect(offending).toEqual([]);
  });
});
