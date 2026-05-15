import { Circle } from 'lucide-react'
import type { ServerHealth } from '@/app/types'
import { cn } from '@/lib/cn'

interface StatusBadgeProps {
  status: ServerHealth
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const isWorking = status === 'working'

  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium',
        isWorking
          ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
          : 'border-rose-400/25 bg-rose-500/10 text-rose-300',
      )}
    >
      <Circle className="h-2.5 w-2.5 fill-current stroke-0" />
      {isWorking ? 'Online' : 'Offline'}
    </span>
  )
}
