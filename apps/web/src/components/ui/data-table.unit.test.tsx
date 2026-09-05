// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ColumnDef } from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table.js';

type Row = { id: string; name: string };

const columns: ColumnDef<Row, unknown>[] = [{ accessorKey: 'name', header: 'Nome', enableSorting: true }];
const baseState = { pagination: { pageIndex: 0, pageSize: 10 }, sorting: [] };

function noop() {
  return vi.fn();
}

afterEach(cleanup);

describe('DataTable (T16 — AD-028 manual mode)', () => {
  it('fires onPaginationChange with the next page state, never re-paginating `data` itself', async () => {
    const onPaginationChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable
        data={[{ id: '1', name: 'Ana' }]}
        columns={columns}
        pageCount={3}
        state={baseState}
        onPaginationChange={onPaginationChange}
        onSortingChange={noop()}
        searchValue=""
        onSearchChange={noop()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /próxima página/i }));

    expect(onPaginationChange).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 10 });
  });

  it('fires onSortingChange with the new sort state when a sortable header is clicked', async () => {
    const onSortingChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable
        data={[{ id: '1', name: 'Ana' }]}
        columns={columns}
        pageCount={1}
        state={baseState}
        onPaginationChange={noop()}
        onSortingChange={onSortingChange}
        searchValue=""
        onSearchChange={noop()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Nome' }));

    expect(onSortingChange).toHaveBeenCalledTimes(1);
  });

  it('debounces onSearchChange, firing once ~300ms after the last keystroke with the typed value', () => {
    vi.useFakeTimers();
    try {
      const onSearchChange = vi.fn();
      render(
        <DataTable
          data={[{ id: '1', name: 'Ana' }]}
          columns={columns}
          pageCount={1}
          state={baseState}
          onPaginationChange={noop()}
          onSortingChange={noop()}
          searchValue=""
          onSearchChange={onSearchChange}
        />,
      );

      const input = screen.getByPlaceholderText('Buscar…');
      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'an' } });
      fireEvent.change(input, { target: { value: 'ana' } });
      expect(onSearchChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(299);
      expect(onSearchChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onSearchChange).toHaveBeenCalledTimes(1);
      expect(onSearchChange).toHaveBeenCalledWith('ana');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the passed emptyState instead of a blank table when data is empty', () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        pageCount={0}
        state={baseState}
        onPaginationChange={noop()}
        onSortingChange={noop()}
        searchValue=""
        onSearchChange={noop()}
        emptyState={<p>vazio customizado</p>}
      />,
    );

    expect(screen.getByText('vazio customizado')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('falls back to DefaultEmptyData when data is empty and no emptyState is passed', () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        pageCount={0}
        state={baseState}
        onPaginationChange={noop()}
        onSortingChange={noop()}
        searchValue=""
        onSearchChange={noop()}
      />,
    );

    expect(screen.getByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('never locally re-sorts the rows it renders (AD-028) — row order always matches the `data` prop order, even when `state.sorting` says otherwise', () => {
    render(
      <DataTable
        data={[
          { id: '1', name: 'Beta' },
          { id: '2', name: 'Alfa' },
        ]}
        columns={columns}
        pageCount={1}
        state={{ pagination: { pageIndex: 0, pageSize: 10 }, sorting: [{ id: 'name', desc: false }] }}
        onPaginationChange={noop()}
        onSortingChange={noop()}
        searchValue=""
        onSearchChange={noop()}
      />,
    );

    // Ordenado localmente por nome (asc) seria "Alfa, Beta" — manter "Beta,
    // Alfa" (a ordem de `data`) prova manualSorting/getCoreRowModel puro.
    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toEqual(['Beta', 'Alfa']);
  });

  it('renders a loading indicator (not the table) when loading is true', () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        pageCount={0}
        state={baseState}
        onPaginationChange={noop()}
        onSortingChange={noop()}
        searchValue=""
        onSearchChange={noop()}
        loading
      />,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
