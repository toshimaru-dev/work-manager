import { ComponentProps, ReactNode, useEffect, useState } from 'react';
import { Button, Text, Title } from '@tremor/react';
import { RiArrowLeftSLine, RiArrowRightSLine, RiDeleteBinLine } from '@remixicon/react';
import { addMonths, currentMonth, formatMonth } from '../lib/date';

/** Tremor の入力欄と見た目を揃えたネイティブ input/select 用クラス */
export const fieldClass =
  'block rounded-tremor-default disabled:cursor-not-allowed disabled:opacity-50 border border-tremor-border bg-tremor-background px-3 py-2 text-tremor-default text-tremor-content-emphasis shadow-tremor-input outline-none focus:border-tremor-brand-subtle focus:ring-2 focus:ring-tremor-brand-muted dark:border-dark-tremor-border dark:bg-dark-tremor-background dark:text-dark-tremor-content-emphasis dark:shadow-dark-tremor-input dark:[color-scheme:dark] dark:focus:border-dark-tremor-brand-subtle dark:focus:ring-dark-tremor-brand-muted';

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-tremor-label font-medium text-tremor-content dark:text-dark-tremor-content">
        {label}
      </span>
      {children}
    </label>
  );
}

/** 幅指定 (w-*) がなければ全幅にする */
const withWidth = (className = '') => (/(^|\s)w-/.test(className) ? className : `w-full ${className}`);

export function NativeInput(props: ComponentProps<'input'>) {
  return <input {...props} className={`${fieldClass} ${withWidth(props.className)}`} />;
}

export function NativeSelect(props: ComponentProps<'select'>) {
  return <select {...props} className={`${fieldClass} pr-8 ${withWidth(props.className)}`} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Title>{title}</Title>
        {description && <Text className="mt-1">{description}</Text>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" size="xs" icon={RiArrowLeftSLine} onClick={() => onChange(addMonths(month, -1))} aria-label="前月" />
      <span className="min-w-[7rem] text-center text-tremor-default font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
        {formatMonth(month)}
      </span>
      <Button variant="secondary" size="xs" icon={RiArrowRightSLine} onClick={() => onChange(addMonths(month, 1))} aria-label="翌月" />
      {month !== currentMonth() && (
        <Button variant="light" size="xs" onClick={() => onChange(currentMonth())} className="ml-2">
          今月
        </Button>
      )}
    </div>
  );
}

/** Webview では confirm() が使えないため、2回クリックで実行する削除ボタン */
export function ConfirmButton({ onConfirm, label = '削除', size = 'xs' }: { onConfirm: () => void; label?: string; size?: 'xs' | 'sm' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      size={size}
      variant={armed ? 'primary' : 'light'}
      color="rose"
      icon={armed ? undefined : RiDeleteBinLine}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      tooltip={armed ? undefined : label}
    >
      {armed ? `${label}する` : undefined}
    </Button>
  );
}

export function ColorDot({ color }: { color: string }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-${color}-500`} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-tremor-default border border-dashed border-tremor-border text-tremor-default text-tremor-content dark:border-dark-tremor-border dark:text-dark-tremor-content">
      {children}
    </div>
  );
}
