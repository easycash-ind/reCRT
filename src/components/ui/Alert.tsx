import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type AlertTone = 'error' | 'ok' | 'info' | 'warning';

const toneClass: Record<AlertTone, string> = {
  error: 'bg-danger-light border border-rose-500/25 text-danger',
  ok: 'bg-success-light border border-emerald-500/25 text-success',
  info: 'bg-surface-hover border border-outline text-on-surface-secondary',
  warning: 'bg-warning-light border border-amber-500/25 text-warning',
};

export interface AlertProps {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}

/** 轻量页面内提示条，亮暗双模自适应 */
export function Alert({
  tone = 'info',
  children,
  className,
}: AlertProps) {
  return (
    <div className={cn('rounded-node px-3.5 py-2.5 text-xs leading-relaxed', toneClass[tone], className)}>
      {children}
    </div>
  );
}
