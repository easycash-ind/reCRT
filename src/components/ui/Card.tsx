import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const cardVariants = cva('hub-card transition-shadow', {
  variants: {
    variant: {
      /** 默认：macOS Widget 卡片（20px 圆角 + 柔和浮起感 + 细微边缘） */
      default:
        'rounded-card bg-surface backdrop-blur-xl border border-outline shadow-[var(--shadow-card)]',
      /**
       * 内嵌凹槽子卡（L2-Sub Recessed Well）：
       * 适合卡片内部的配方卡、对话台词卡、统计子块。
       */
      soft: 'hub-card--soft hub-widget-well rounded-node bg-surface-well border border-outline shadow-none',
      /**
       * 深色曜石 Glass 小组件卡片
       */
      glass:
        'rounded-[var(--radius-node-glass,1.5rem)] bg-[var(--glass-dark-elevated,rgba(28,30,38,0.92))] backdrop-blur-[40px] text-white/92 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_10px_28px_rgba(0,0,0,0.36)]',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type CardProps = React.ComponentProps<'div'> & VariantProps<typeof cardVariants>;

const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'default', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
});

const CardMedia = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  function CardMedia({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('hub-card-media relative overflow-hidden bg-surface-secondary', className)}
        {...props}
      />
    );
  },
);

const CardBody = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  function CardBody({ className, ...props }, ref) {
    return <div ref={ref} className={cn('hub-card-body px-3 py-2', className)} {...props} />;
  },
);

const CardFooter = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('hub-card-footer flex items-center px-3 pb-3 pt-1', className)}
        {...props}
      />
    );
  },
);

export { Card, CardMedia, CardBody, CardFooter, cardVariants };
export type { CardProps };
