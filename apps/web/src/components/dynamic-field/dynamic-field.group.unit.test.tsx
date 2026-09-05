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
// `node.value` — para `group`, `node.value` é o array de RenderNode dos
// filhos já hidratados (usado só pela recursão), não o dado que
// react-hook-form deve controlar.
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

describe('DynamicField — group (T15)', () => {
  it('renders every nested field recursively and round-trips an edit through the whole path', async () => {
    // hydrate() real (não um RenderNode escrito à mão) confirma que a
    // recursão de DynamicFieldGroup consome exatamente o que field-engine
    // produz para um `group` com 2 campos.
    const initialValue = { city: 'Recife', zip: '' };
    const [node] = hydrate(
      [
        {
          fieldId: 'address',
          label: 'Endereço',
          type: 'group',
          fields: [
            { fieldId: 'city', label: 'Cidade', type: 'text' },
            { fieldId: 'zip', label: 'CEP', type: 'text' },
          ],
        },
      ],
      { address: initialValue },
    );

    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} initialValue={initialValue} onSubmit={onSubmit} />);

    expect(screen.getByText('Endereço')).toBeInTheDocument();
    const cityInput = screen.getByLabelText('Cidade');
    const zipInput = screen.getByLabelText('CEP');
    expect(cityInput).toHaveValue('Recife');
    expect(zipInput).toHaveValue('');

    await user.type(zipInput, '50000');

    await user.click(screen.getByRole('button', { name: 'enviar' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ field: { city: 'Recife', zip: '50000' } }, expect.anything()),
    );
  });
});
