// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { RenderNode } from '@crm/field-engine';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { FieldValues } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DynamicField } from './dynamic-field.js';

// Radix Select/Popover chamam APIs que o jsdom não implementa — sem estes
// polyfills mínimos, abrir o Select/Popover lança em qualquer teste daqui
// pra baixo. Nenhum outro arquivo deste projeto testava um primitive Radix
// ainda (T8-T13 são "Tests: none"), então este é o primeiro precedente.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  // biome-ignore lint/suspicious/noExplicitAny: polyfill mínimo, jsdom não implementa ResizeObserver
  (global as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

// `useForm<FieldValues>()` (o `FieldValues` de react-hook-form, não um tipo
// próprio): `DynamicField.control` é tipado como `Control` (que resolve pro
// MESMO default de react-hook-form) exatamente porque os paths de `name` são
// dinâmicos — um `Control<{field:unknown}>` próprio NÃO é estruturalmente
// atribuível a `Control<FieldValues>` (confirmado via tsc), então o harness
// precisa do mesmo tipo genérico que os componentes esperam.
function Harness({ node, onSubmit }: { node: RenderNode; onSubmit: (values: FieldValues) => void }) {
  const { control, handleSubmit } = useForm<FieldValues>({ defaultValues: { field: node.value } });
  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)}>
      <DynamicField node={node} name="field" control={control} />
      <button type="submit">enviar</button>
    </form>
  );
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'enviar' }));
}

describe('DynamicField — leaf types (T14)', () => {
  it('text: renders an Input bound to control, surfaces maxLength as a hint, and round-trips typed text', async () => {
    const node: RenderNode = { fieldId: 'name', label: 'Nome', type: 'text', maxLength: 50, value: '' };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    const input = screen.getByLabelText('Nome');
    expect(input).toHaveAttribute('maxlength', '50');

    await user.type(input, 'Ana');
    await submit(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: 'Ana' }, expect.anything()));
  });

  it('text (multiline): renders a textarea instead of an Input', () => {
    const node: RenderNode = { fieldId: 'notes', label: 'Notas', type: 'text', multiline: true, value: 'oi' };
    render(<Harness node={node} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Notas').tagName).toBe('TEXTAREA');
  });

  it('number: renders a numeric Input, surfaces min/max as hints, and round-trips a typed number', async () => {
    const node: RenderNode = { fieldId: 'age', label: 'Idade', type: 'number', min: 0, max: 120, value: null };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    const input = screen.getByLabelText('Idade');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '120');

    await user.type(input, '30');
    await submit(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: 30 }, expect.anything()));
  });

  it('currency: renders MoneyInput storing integer cents and a code/precision-aware Intl.NumberFormat preview', async () => {
    const node: RenderNode = {
      fieldId: 'price',
      label: 'Preço',
      type: 'currency',
      code: 'USD',
      precision: 2,
      value: 0,
    };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Preço'), '1234');
    await submit(user);

    // Cents inteiros, nunca decimal (contrato de field-engine/validate.ts).
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: 1234 }, expect.anything()));

    // Intl.NumberFormat usa NBSP (U+00A0) entre símbolo e valor; o matcher
    // padrão do testing-library normaliza espaços do DOM para " " comum, mas
    // não normaliza a string esperada — comparar já normalizado dos dois lados.
    const expectedPreview = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(12.34)
      .replace(/\s/g, ' ');
    expect(screen.getByText(expectedPreview)).toBeInTheDocument();
  });

  it('percent: renders a numeric Input with a % suffix and round-trips a typed value', async () => {
    const node: RenderNode = { fieldId: 'discount', label: 'Desconto', type: 'percent', precision: 2, value: null };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    const input = screen.getByLabelText('Desconto');
    expect(input).toHaveAttribute('type', 'number');
    expect(screen.getByText('%')).toBeInTheDocument();

    await user.type(input, '15.5');
    await submit(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: 15.5 }, expect.anything()));
  });

  it('boolean: renders a Switch and round-trips its toggled state', async () => {
    const node: RenderNode = { fieldId: 'active', label: 'Ativo', type: 'boolean', value: false };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('switch'));
    await submit(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: true }, expect.anything()));
  });

  it('date/datetime: seeds the trigger from the current value and round-trips a newly picked day as an ISO string', async () => {
    const node: RenderNode = { fieldId: 'birthday', label: 'Nascimento', type: 'date', value: '2026-06-15' };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    // Round-trip #1: valor inicial aparece formatado no gatilho.
    expect(screen.getByRole('button', { name: /15 jun 2026/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /15 jun 2026/i }));
    const dayCell = (await screen.findAllByText('16')).find((el) => el.closest('button'));
    if (!dayCell) throw new Error('dia 16 não encontrado no calendário');
    await user.click(dayCell);
    await submit(user);

    // Round-trip #2: dia escolhido vira string ISO de DATA (sem horário) — o
    // contrato do tipo `date` (z.iso.date() em field-engine/validate.ts).
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: '2026-06-16' }, expect.anything()));
  });

  it('select: renders a Select and round-trips a chosen option key', async () => {
    const node: RenderNode = {
      fieldId: 'category',
      label: 'Categoria',
      type: 'select',
      options: [
        { key: 'a', label: 'Alfa' },
        { key: 'b', label: 'Beta' },
      ],
      value: null,
    };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Beta' }));
    await submit(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: 'b' }, expect.anything()));
  });

  it('select (multiple): renders one Checkbox per option and round-trips the toggled key list', async () => {
    const node: RenderNode = {
      fieldId: 'tags',
      label: 'Tags',
      type: 'select',
      multiple: true,
      options: [
        { key: 'a', label: 'Alfa' },
        { key: 'b', label: 'Beta' },
      ],
      value: [],
    };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('checkbox', { name: 'Beta' }));
    await submit(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: ['b'] }, expect.anything()));
  });

  it('status: renders a Select with a color dot per option and round-trips a chosen status key', async () => {
    const node: RenderNode = {
      fieldId: 'status',
      label: 'Status',
      type: 'status',
      options: [
        { key: 'open', label: 'Aberto', color: '#22c55e', order: 0 },
        { key: 'closed', label: 'Fechado', color: '#ef4444', order: 1 },
      ],
      value: 'open',
    };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('combobox'));
    const option = await screen.findByRole('option', { name: 'Fechado' });
    expect(within(option).getByText('Fechado')).toBeInTheDocument();
    await user.click(option);
    await submit(user);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ field: 'closed' }, expect.anything()));
  });
});

describe('DynamicField — document/reference read-only fallback (T15)', () => {
  it('document: renders the raw stored value as read-only text and preserves it on submit (never blocks/drops it)', async () => {
    const node: RenderNode = {
      fieldId: 'contract',
      label: 'Contrato',
      type: 'document',
      value: { assetId: 'a1', filename: 'contrato.pdf', mime: 'application/pdf', size: 100 },
    };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    expect(screen.getByText(/contrato\.pdf/)).toBeInTheDocument();
    // Nenhum controle editável (input/textarea/combobox/switch) é renderizado.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await submit(user);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { field: { assetId: 'a1', filename: 'contrato.pdf', mime: 'application/pdf', size: 100 } },
        expect.anything(),
      ),
    );
  });

  it('reference: renders the raw stored ObjectId as read-only text and preserves it on submit', async () => {
    const node: RenderNode = {
      fieldId: 'owner',
      label: 'Responsável',
      type: 'reference',
      target: 'user',
      value: '507f1f77bcf86cd799439011',
    };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness node={node} onSubmit={onSubmit} />);

    expect(screen.getByText('507f1f77bcf86cd799439011')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await submit(user);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ field: '507f1f77bcf86cd799439011' }, expect.anything()),
    );
  });
});
