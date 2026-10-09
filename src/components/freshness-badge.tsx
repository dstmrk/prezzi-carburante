import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime } from '@/lib/format'
import { FRESH_DAYS, STALE_DAYS, getFreshness } from '@/lib/freshness'
import { cn } from '@/lib/utils'

const LEVEL_CLASS = {
  fresh: '',
  aging: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  stale: '',
  unknown: '',
} as const

const LEVEL_VARIANT = {
  fresh: 'secondary',
  aging: 'outline',
  stale: 'destructive',
  unknown: 'outline',
} as const

const LEVEL_HINT = {
  fresh: `Comunicato negli ultimi ${FRESH_DAYS} giorni`,
  aging: `Comunicato tra ${FRESH_DAYS} e ${STALE_DAYS} giorni fa: potrebbe essere cambiato`,
  stale: `Comunicato più di ${STALE_DAYS} giorni fa: verifica prima di partire`,
  unknown: 'Data di aggiornamento non disponibile',
} as const

export function FreshnessBadge({ date, className }: { date: string; className?: string }) {
  const freshness = getFreshness(date)
  const label = freshness.timestamp === null ? 'data n/d' : freshness.relative

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant={LEVEL_VARIANT[freshness.level]}
            className={cn(LEVEL_CLASS[freshness.level], className)}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>
        {freshness.timestamp !== null && (
          <p className="font-medium">Aggiornato il {formatDateTime(freshness.timestamp)}</p>
        )}
        <p>{LEVEL_HINT[freshness.level]}</p>
      </TooltipContent>
    </Tooltip>
  )
}
