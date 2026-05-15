import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  subtitleClassName?: string
  titleClassName?: string
  actionsClassName?: string
}

export function SectionHeader({
  title,
  subtitle,
  actions,
  subtitleClassName,
  titleClassName,
  actionsClassName,
}: SectionHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className={cn('text-3xl font-bold leading-[0.95] tracking-[-0.03em] text-zinc-100 sm:text-4xl xl:text-5xl 2xl:text-[58px]', titleClassName)}>
          {title}
        </h1>
        {subtitle ? <p className={cn('mt-1.5 text-sm text-zinc-500', subtitleClassName)}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={cn('flex flex-wrap items-center gap-2', actionsClassName)}>{actions}</div> : null}
    </header>
  )
}
