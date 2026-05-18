import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/lib/ui';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const triggerClass = cn(
  'flex h-9 w-full items-center justify-between gap-2 rounded-md px-3 py-2',
  'border border-zinc-700 bg-zinc-800/60 text-sm text-zinc-100',
  'hover:bg-zinc-700/60 transition-colors',
  'focus:outline-none focus:ring-2 focus:ring-[#5865F2] focus:ring-offset-1 focus:ring-offset-[#121214]',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'data-[placeholder]:text-zinc-400',
);

const contentClass = cn(
  'z-50 min-w-[8rem] overflow-hidden rounded-md',
  'border border-zinc-700 bg-zinc-900 text-sm shadow-xl',
  'data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
);

const itemClass = cn(
  'relative flex cursor-default select-none items-center rounded px-2 py-1.5 text-sm',
  'text-zinc-200 outline-none transition-colors',
  'focus:bg-[#5865F2]/20 focus:text-zinc-100',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
);

const groupLabelClass = 'px-2 py-1.5 text-xs font-semibold text-zinc-500';

export function Select({
  value,
  onValueChange,
  options,
  groups,
  placeholder,
  disabled,
  className,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger className={cn(triggerClass, className)}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <span className="text-zinc-400 text-xs">▼</span>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={contentClass} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport className="p-1">
            {options &&
              options.map((opt) => (
                <SelectPrimitive.Item key={opt.value} value={opt.value} className={itemClass}>
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            {groups &&
              groups.map((group) => (
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
