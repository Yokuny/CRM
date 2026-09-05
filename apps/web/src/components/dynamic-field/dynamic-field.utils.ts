import type { RenderNode } from '@crm/field-engine';

// `hydrate()` produces a RenderNode[] tree (structural metadata: type/label/
// options per node), but react-hook-form's `useForm({ defaultValues })` needs
// a PLAIN nested object matching the same dot-path structure `DynamicField`'s
// `name`s use (T15's deviation note — group/array `RenderNode.value` is
// itself RenderNode[], never plain data). Without this conversion, edit-mode
// forms (T24/T26) would render empty instead of the record's real stored
// values. Built once here, reused by every DynamicField-driven form
// (T22/T24/T26).
function extractValue(node: RenderNode): unknown {
  if (node.type === 'group') return renderNodesToDefaultValues(node.value as RenderNode[]);
  if (node.type === 'array') return (node.value as RenderNode[]).map(extractValue);
  return node.value;
}

export function renderNodesToDefaultValues(nodes: RenderNode[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const node of nodes) result[node.fieldId] = extractValue(node);
  return result;
}
