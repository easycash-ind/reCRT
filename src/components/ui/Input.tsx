import { cn } from '../../lib/cn';

type InputProps = React.ComponentProps<'input'>;

function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'h-8 w-full rounded-control border border-outline bg-surface px-3 text-sm text-on-surface placeholder:text-on-surface-muted outline-none transition-colors',
        'hover:border-outline-hover focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary-focus)]',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
export type { InputProps };
