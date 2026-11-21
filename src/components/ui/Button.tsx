import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

export type ButtonVariant =
  | 'default'
  | 'soft'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'danger-solid'
  | 'glass'
  | 'unstyled';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type ButtonShape = 'control' | 'pill';

const VARIANT_RECIPE_CLASS: Partial<Record<ButtonVariant, string>> = {
  default: 'hub-btn--default',
  soft: 'hub-btn--soft',
  outline: 'hub-btn--outline',
  ghost: 'hub-btn--ghost',
  danger: 'hub-btn--danger',
};

const SIZE_RECIPE_CLASS: Partial<Record<ButtonSize, string>> = {
  xs: 'hub-btn--xs',
  sm: 'hub-btn--sm',
  lg: 'hub-btn--lg',
};

const buttonVariants = cva(
  'hub-btn inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-px border border-transparent',
  {
    variants: {
      variant: {
        default:
          'hub-btn--default bg-brand/90 text-white shadow-[0_2px_8px_rgba(45,52,255,0.22)] hover:bg-brand focus-visible:ring-2 focus-visible:ring-brand/40',
        /**
         * 节点「生成」等：默认同 ghost 选中（主题浅底+主题字）；hover 升为 default。
         */
        soft:
          'hub-btn--soft border-transparent bg-[var(--theme-primary-bg)] font-semibold text-[var(--theme-primary-text)] hover:bg-brand/90 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/40',
        outline:
          'hub-btn--outline border-black/[0.08] bg-white/75 backdrop-blur-md text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] hover:bg-white/95 hover:border-black/[0.15]',
        /** 画布任务 / 筛选：透明底；hover 用半透明黑叠暗父容器；pressed 主题浅底+字变粗变主题色 */
        ghost:
          'hub-btn--ghost text-on-surface-secondary hover:bg-black/[0.04] hover:text-on-surface',
        danger:
          'hub-btn--danger bg-danger/10 text-danger hover:bg-danger/20 focus-visible:ring-2 focus-visible:ring-danger/30',
        'danger-solid':
          'hub-btn--danger-solid bg-danger/90 text-white hover:bg-danger focus-visible:ring-2 focus-visible:ring-danger/40',
        glass:
          'hub-btn--glass border-0 bg-white/20 text-white/85 backdrop-blur-md hover:bg-white/30 hover:text-white active:bg-white/85 active:text-black/85',
        unstyled: '',
      },
      size: {
        xs: 'h-6 gap-1 px-2 text-xs',
        sm: 'h-7 gap-1 px-2.5 text-xs',
        md: 'h-8 gap-1.5 px-3 text-sm',
        lg: 'h-9 gap-1.5 px-4 text-sm',
      },
      shape: {
        control: 'rounded-control',
        pill: 'rounded-full',
      },
      icon: {
        true: 'px-0 shrink-0',
        false: '',
      },
      pressed: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      {
        icon: true,
        size: 'xs',
        class: 'w-6 min-w-6',
      },
      {
        icon: true,
        size: 'sm',
        class: 'w-7 min-w-7',
      },
      {
        icon: true,
        size: 'md',
        class: 'w-8 min-w-8',
      },
      {
        icon: true,
        size: 'lg',
        class: 'w-9 min-w-9',
      },
      {
        shape: 'pill',
        icon: false,
        size: 'xs',
        class: 'px-2.5 text-xs',
      },
      {
        shape: 'pill',
        icon: false,
        size: 'sm',
        class: 'px-3 text-xs',
      },
      {
        shape: 'pill',
        icon: false,
        size: 'md',
        class: 'px-3.5 text-xs',
      },
      {
        shape: 'pill',
        icon: false,
        size: 'lg',
        class: 'px-4.5 text-sm',
      },
      {
        variant: 'ghost',
        pressed: true,
        class:
          'border-transparent bg-[var(--theme-primary-bg)] font-semibold text-[var(--theme-primary-text)] hover:bg-[var(--theme-primary-bg)] hover:text-[var(--theme-primary-text)]',
      },
      {
        variant: 'glass',
        pressed: true,
        class:
          'bg-white/85 text-black/85 font-semibold hover:bg-white/90 hover:text-black/90',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'md',
      shape: 'control',
      icon: false,
      pressed: false,
    },
  },
);

type ButtonProps = Omit<React.ComponentProps<'button'>, 'type'> &
  VariantProps<typeof buttonVariants> & {
    type?: React.ComponentProps<'button'>['type'];
    icon?: boolean;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'default',
    size = 'md',
    shape = 'control',
    icon = false,
    pressed = false,
    type = 'button',
    ...props
  },
  ref,
) {
  const isPressed = Boolean(pressed);
  const isIcon = Boolean(icon);
  const resolvedVariant = (variant ?? 'default') as ButtonVariant;
  const resolvedSize = (size ?? 'md') as ButtonSize;

  if (resolvedVariant === 'unstyled') {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={isPressed || undefined}
        className={className}
        {...props}
      />
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      data-no-theme-hover
      aria-pressed={isPressed || undefined}
      className={cn(
        'hub-btn',
        VARIANT_RECIPE_CLASS[resolvedVariant],
        SIZE_RECIPE_CLASS[resolvedSize],
        shape === 'pill' && 'hub-btn--pill',
        isIcon && 'hub-btn--icon',
        isPressed && 'is-pressed',
        buttonVariants({
          variant: resolvedVariant,
          size: resolvedSize,
          shape,
          icon: isIcon,
          pressed: isPressed,
        }),
        className,
      )}
      {...props}
    />
  );
});

export { Button, buttonVariants };
export type { ButtonProps };
