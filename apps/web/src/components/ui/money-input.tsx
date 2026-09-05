import { useEffect, useState } from 'react';
import { centsToInputDisplay, maskMoneyInput, parseMoneyInput } from '@/lib/helpers/money.helper.js';
import { cn } from '@/lib/utils.js';
import { Input, type InputProps } from './input.js';

function MoneyInput({
  value,
  onChange,
  className,
  disabled,
  placeholder = 'R$ 0,00',
  onBlur,
  onFocus,
  ...props
}: MoneyInputProps) {
  const [display, setDisplay] = useState(() => centsToInputDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDisplay(centsToInputDisplay(value));
    }
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      disabled={disabled}
      className={cn('tabular-nums', className)}
      value={focused ? display : value > 0 ? centsToInputDisplay(value) : ''}
      onFocus={(e) => {
        setFocused(true);
        setDisplay(value > 0 ? centsToInputDisplay(value) : '');
        onFocus?.(e);
      }}
      onChange={(e) => {
        const masked = maskMoneyInput(e.target.value);
        setDisplay(masked);
        try {
          onChange(parseMoneyInput(masked || '0'));
        } catch {
          // mantém último valor válido no form
        }
      }}
      onBlur={(e) => {
        setFocused(false);
        try {
          const cents = parseMoneyInput(display || '0');
          onChange(cents);
          setDisplay(centsToInputDisplay(cents));
        } catch {
          setDisplay(centsToInputDisplay(value));
        }
        onBlur?.(e);
      }}
      {...props}
    />
  );
}

export { MoneyInput };

type MoneyInputProps = Omit<InputProps, 'type' | 'value' | 'onChange'> & {
  value: number;
  onChange: (cents: number) => void;
};
