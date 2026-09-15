import { useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 300;

// Extraído do antigo componentes/ui/data-table.tsx: mantém o input responsivo
// (estado local atualiza na hora) sem disparar `onChange` — e portanto a
// navegação/refetch server-side (AD-028) — a cada tecla digitada.
export function useDebouncedSearch(value: string, onChange: (value: string) => void) {
  const [search, setSearch] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setSearch(value), [value]);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleChange = (next: string) => {
    setSearch(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(next), SEARCH_DEBOUNCE_MS);
  };

  return [search, handleChange] as const;
}
