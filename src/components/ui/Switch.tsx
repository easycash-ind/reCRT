import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type SwitchSize = 'xs' | 'sm' | 'md' | 'lg';

export interface SwitchOption<T extends string = string> {
  value: T;
  label: string;
  /** Per-option disable; does not affect other segments. */
  disabled?: boolean;
}

export type SwitchProps<T extends string = string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SwitchOption<T>[];
  className?: string;
  /** Horizontal padding for each label segment. Default adapts to size. */
  segmentClassName?: string;
  disabled?: boolean;
  /**
   * 高度档位，对齐 Button / FilterDropdown / Select：
   * xs=24px(h-6), sm=28px(h-7), md=32px(h-8, 默认), lg=36px(h-9)
   */
  size?: SwitchSize;
  /**
   * solid：灰底 + 深色滑块（对话/画布默认）
   * ghost：无底色 + 描边；选中态对齐 Button ghost pressed（主题浅底 + 主题字色加粗）
   */
  variant?: 'solid' | 'ghost';
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>;

const SWITCH_SIZE_CLASS: Record<SwitchSize, { root: string; segment: string; defaultPad: string }> = {
  xs: {
    root: 'hub-switch--xs h-6',
    segment: 'h-5 text-[11px]',
    defaultPad: 'px-2.5',
  },
  sm: {
    root: 'hub-switch--sm h-7',
    segment: 'h-6 text-xs',
    defaultPad: 'px-3',
  },
  md: {
    root: 'hub-switch--md h-8',
    segment: 'h-7 text-xs',
    defaultPad: 'px-3.5',
  },
  lg: {
    root: 'hub-switch--lg h-9',
    segment: 'h-8 text-sm',
    defaultPad: 'px-4',
  },
};

/** Sliding segmented switch (N options). Also replaces boolean Toggle switches via 2 options. */
export function Switch<T extends string>({
  value,
  onChange,
  options,
  className,
  segmentClassName,
  disabled = false,
  size = 'md',
  variant = 'solid',
  ...props
}: SwitchProps<T>) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const count = Math.max(options.length, 1);
  const isGhost = variant === 'ghost';
  const sizeSpec = SWITCH_SIZE_CLASS[size];

  return (
    <div
      {...props}
      className={cn(
        'hub-switch relative inline-grid items-center rounded-full p-0.5 cursor-pointer select-none transition-colors',
        sizeSpec.root,
        isGhost
          ? 'hub-switch--ghost border border-outline bg-transparent'
          : 'hub-switch--solid bg-black/5',
        disabled && 'is-disabled cursor-not-allowed opacity-50',
        className,
      )}
      style={{
        ...props.style,
        gridTemplateColumns: `repeat(${count}, 1fr)`,
      }}
      data-disabled={disabled ? 'true' : undefined}
    >
      <span
        className={cn(
          'hub-switch-thumb absolute inset-y-0.5 left-0.5 rounded-full transition-transform duration-200 ease-in-out',
          isGhost
            ? 'bg-[var(--theme-primary-bg)] shadow-none'
            : 'bg-black/80 shadow-sm',
        )}
        style={{
          width: `calc((100% - 4px) / ${count})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map((option, index) => {
        const active = index === activeIndex;
        const optionDisabled = disabled || !!option.disabled;
        return (
          <button
            key={option.value}
            type="button"
            disabled={optionDisabled}
            onClick={() => {
              if (optionDisabled) return;
              onChange(option.value);
            }}
            className={cn(
              'hub-switch-segment relative z-10 whitespace-nowrap rounded-full text-center transition-colors',
              sizeSpec.segment,
              segmentClassName ?? sizeSpec.defaultPad,
              option.disabled && !disabled && 'opacity-40 cursor-not-allowed',
              active && 'is-active',
              active
                ? isGhost
                  ? 'font-semibold text-[var(--theme-primary-text)]'
                  : 'font-medium text-white'
                : 'font-medium text-on-surface-secondary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
