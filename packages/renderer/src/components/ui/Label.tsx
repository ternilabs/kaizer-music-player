import type { LabelHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode
}

export function Label({ children, className, ...props }: LabelProps) {
  return (
    <label
      className={cn('text-xs font-medium tracking-wide text-zinc-400', className)}
      {...props}
    >
      {children}
    </label>
  )
}
