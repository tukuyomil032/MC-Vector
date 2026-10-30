import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/ui';
import * as SelectPrimitive from '@radix-ui/react-select';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'defaultValue' | 'onChange'
> {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/*
 * Arc's Select has no option groups yet, and the grouped server-software picker needs them. So this
 * stays on Radix and uses the Arc tokens, rather than vendoring a grouped variant.
 */
const triggerClass = cn(
  'flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2',
  'border border-[var(--border-strong)] bg-[var(--surface)] text-sm text-[var(--foreground)]',
  'transition-colors hover:border-[var(--foreground)]',
  'focus-visible:border-[var(--foreground)] focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'data-[placeholder]:text-[var(--text-muted)]',
);

const contentClass = cn(
  'z-50 min-w-[8rem] overflow-hidden rounded-[var(--radius-control)]',
  'border border-[var(--border)] bg-[var(--surface-raised)] text-sm text-[var(--foreground)] shadow-xl',
  'data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
);

const itemClass = cn(
  'relative flex cursor-default select-none items-center rounded px-2 py-1.5 text-sm',
  'text-[var(--foreground)] outline-none transition-colors',
  'focus:bg-[var(--surface-muted)]',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
);

const groupLabelClass = 'px-2 py-1.5 text-xs font-semibold text-[var(--text-muted)]';

export function Select({
  value,
  onValueChange,
  options,
  groups,
  placeholder,
  disabled,
  className,
  ...triggerProps
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger {...triggerProps} className={cn(triggerClass, className)}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={14} strokeWidth={1.75} className="text-[var(--text-muted)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={contentClass} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport className="p-1">
            {options?.map((opt) => (
              <SelectPrimitive.Item key={opt.value} value={opt.value} className={itemClass}>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
            {groups?.map((group) => (
              <SelectPrimitive.Group key={group.label}>
                <SelectPrimitive.Label className={groupLabelClass}>
                  {group.label}
                </SelectPrimitive.Label>
                {group.options.map((opt) => (
                  <SelectPrimitive.Item key={opt.value} value={opt.value} className={itemClass}>
                    <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
