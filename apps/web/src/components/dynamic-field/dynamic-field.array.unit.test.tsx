// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { hydrate, type RenderNode } from '@crm/field-engine';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { FieldValues } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DynamicField } from './dynamic-field.js';

// `initialValue` é o valor CRU (o mesmo objeto passado a `hydrate()`), nunca
// `node.value` — para `array`/`group`, `node.value` é a árvore de
// RenderNode[] já hidratada (usada só pela recursão para saber o tipo de
// cada filho), não o dado que react-hook-form deve controlar.
function Harness({
  node,
  initialValue,
  onSubmit,
}: {
  node: RenderNode;
  initialValue: unknown;
  onSubmit: (values: FieldValues) => void;
}) {
  const { control, handleSubmit } = useForm<FieldValues>({ defaultValues: { field: initialValue } });
  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <DynamicField node={node} name="field" control={control} />
      <button type="submit">enviar</button>
    </form>
  );
}

afterEach(cleanup);

describe('DynamicField — array (T15)', () => {
  it('renders one DynamicField per existing item and round-trips a new item added via "Adicionar"', async () => {
    const [node] = hydrate(
      [{ fieldId: 'tags', label: 'Tags', type: 'array', of: { fieldId: 'tag', label: 'Tag', type: 'text' } }],
      { tags: ['a'] },
    );
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} initialValue={['a']} onSubmit={onSubmit} />);

    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveValue('a');

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    const inputsAfterAdd = screen.getAllByRole('textbox');
    expect(inputsAfterAdd).toHaveLength(2);
    await user.type(inputsAfterAdd[1], 'b');

    await user.click(screen.getByRole('button', { name: 'enviar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: ['a', 'b'] }, expect.anything()));
  });

  it('removes an item via "Remover" and round-trips the shrunk list', async () => {
    const [node] = hydrate(
      [{ fieldId: 'tags', label: 'Tags', type: 'array', of: { fieldId: 'tag', label: 'Tag', type: 'text' } }],
      { tags: ['a', 'b'] },
    );
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} initialValue={['a', 'b']} onSubmit={onSubmit} />);

    expect(screen.getAllByRole('textbox')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'enviar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: ['b'] }, expect.anything()));
  });
});
