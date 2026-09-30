import { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type BtnVariant = 'primary' | 'ghost' | 'outline' | 'subtle' | 'danger'
type BtnSize = 'sm' | 'md' | 'lg'

const btnBase =
  'no-drag inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none active:scale-[0.98]'

const btnVariants: Record<BtnVariant, string> = {
  primary:
    'brand-gradient text-white shadow-[0_8px_24px_-8px_rgba(242,98,10,0.55)] hover:brightness-[1.06] hover:shadow-[0_10px_30px_-8px_rgba(242,98,10,0.6)]',
  ghost: 'text-ink-800/60 hover:text-ink-900 hover:bg-black/5',
  outline: 'border border-black/10 bg-white text-ink-800/90 hover:border-brand-400 hover:bg-brand-50',
  subtle: 'bg-black/5 text-ink-800/90 hover:bg-black/10',
  danger: 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/25'
}

const btnSizes: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]'
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }
>(({ className, variant = 'primary', size = 'md', ...props }, ref) => (
  <button ref={ref} className={cn(btnBase, btnVariants[variant], btnSizes[size], className)} {...props} />
))
Button.displayName = 'Button'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-surface rounded-2xl', className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pb-3', className)} {...props} />
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'no-drag h-10 w-full rounded-xl bg-ink-50 border border-black/10 px-3 text-sm text-ink-900 placeholder:text-ink-800/35',
        'focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15 focus:bg-white outline-none transition',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'ok' | 'warn' | 'fail' | 'brand' | 'vip' }) {
  const tones = {
    neutral: 'bg-black/6 text-ink-800/70',
    ok: 'bg-emerald-500/12 text-emerald-700 border border-emerald-500/20',
    warn: 'bg-amber-500/12 text-amber-700 border border-amber-500/25',
    fail: 'bg-red-500/12 text-red-600 border border-red-500/20',
    brand: 'bg-brand-500/12 text-brand-700 border border-brand-500/25',
    vip: 'bg-yellow-400/15 text-yellow-700 border border-yellow-500/25'
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className
      )}
      {...props}
    />
  )
}

import { useState, ReactNode } from 'react'
import { ChevronDown, CheckCircle2 } from 'lucide-react'

export function Collapsible({
  title,
  icon,
  badge,
  defaultOpen = false,
  done = false,
  children
}: {
  title: string
  icon?: ReactNode
  badge?: ReactNode
  defaultOpen?: boolean
  done?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card-surface overflow-hidden rounded-2xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="no-drag flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : icon}
        <span className="flex-1 text-sm font-semibold text-ink-900">{title}</span>
        {badge}
        <ChevronDown className={cn('h-5 w-5 text-ink-800/40 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-black/6 px-5 py-4">{children}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/15 border-t-brand-500',
        className
      )}
    />
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/8">
      <div
        className="h-full brand-gradient transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
