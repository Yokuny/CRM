// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { FieldDef } from '@crm/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DynamicFieldValue } from './dynamic-field-value.js';

const renderValue = (def: FieldDef, value: unknown) => render(<DynamicFieldValue def={def} value={value} />);

describe('DynamicFieldValue', () => {
  afterEach(() => cleanup());

  it('shows option labels (never the raw key), including multiple selection', () => {
    const def: FieldDef = {
      fieldId: 'canal',
      label: 'Canal',
      type: 'select',
      multiple: true,
      options: [
        { key: 'ig', label: 'Instagram' },
        { key: 'wa', label: 'WhatsApp' },
      ],
    };
    renderValue(def, ['ig', 'wa']);
    expect(screen.getByText('Instagram, WhatsApp')).toBeInTheDocument();
  });

  it('shows the status option label', () => {
    renderValue(
      {
        fieldId: 'status',
        label: 'Status',
        type: 'status',
        options: [{ key: 'vip', label: 'VIP', color: '#A855F7', order: 0 }],
      },
      'vip',
    );
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });

  it('formats currency by the field code/precision, booleans as Sim/Não, percent with %', () => {
    const { rerender } = renderValue({ fieldId: 'v', label: 'V', type: 'currency', code: 'BRL', precision: 2 }, 123456);
    expect(screen.getByText(/R\$\s1\.234,56/)).toBeInTheDocument();

    rerender(<DynamicFieldValue def={{ fieldId: 'b', label: 'B', type: 'boolean' }} value={false} />);
    expect(screen.getByText('Não')).toBeInTheDocument();

    rerender(<DynamicFieldValue def={{ fieldId: 'p', label: 'P', type: 'percent', precision: 1 }} value={12.5} />);
    expect(screen.getByText('12.5%')).toBeInTheDocument();
  });
});
