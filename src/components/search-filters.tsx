import { useQuery } from '@tanstack/react-query'
import { InfoIcon, SlidersHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { fetchFuels } from '@/lib/api'
import { FRESH_DAYS, STALE_DAYS } from '@/lib/freshness'
import type { Filters, SearchMode } from '@/lib/types'

const MAIN_FUELS = [
  { value: 'benzina', label: 'Benzina' },
  { value: 'gasolio', label: 'Gasolio' },
  { value: 'gpl', label: 'GPL' },
  { value: 'metano', label: 'Metano' },
]
const MAIN_FUEL_IDS = new Set(MAIN_FUELS.map((f) => f.value))
/** Carburanti di nicchia distribuiti da pochissimi impianti: non utili da confrontare. */
const MIN_STATIONS_FOR_OTHER_FUELS = 100

const RESULT_OPTIONS = [5, 10, 15, 25, 50].map((n) => ({ value: String(n), label: String(n) }))

/** Slider che aggiorna l'etichetta durante il trascinamento e notifica solo al rilascio. */
function CommittedSlider({
  id,
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  format,
  onCommit,
}: {
  id: string
  label: string
  /** Contenuto accanto all'etichetta, escluso dal nome accessibile dello slider. */
  hint?: React.ReactNode
  value: number
  min: number
  max: number
  step?: number
  format: (value: number) => string
  onCommit: (value: number) => void
}) {
  // Valore durante il trascinamento; null quando il controllo mostra il valore salvato.
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>
          <span id={`${id}-label`}>{label}</span>
          {hint}
        </FieldTitle>
        <span className="text-sm text-muted-foreground tabular-nums">{format(shown)}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[shown]}
        onValueChange={(next) => setDraft(Array.isArray(next) ? next[0]! : (next as number))}
        onValueCommitted={(next) => {
          setDraft(null)
          onCommit(Array.isArray(next) ? next[0]! : (next as number))
        }}
        aria-labelledby={`${id}-label`}
      />
    </Field>
  )
}

function FreshnessLegend() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Come leggere la data di aggiornamento"
            className="text-muted-foreground"
          />
        }
      >
        <InfoIcon />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">
        <p className="mb-2 font-medium">Data di aggiornamento</p>
        <p className="mb-3 text-muted-foreground">
          I gestori comunicano il prezzo al MIMIT quando lo cambiano. Più è vecchio, più è probabile
          che non sia aggiornato.
        </p>
        <ul className="flex flex-col gap-2">
          <li className="flex items-center gap-2">
            <Badge variant="secondary">oggi</Badge> negli ultimi {FRESH_DAYS} giorni
          </li>
          <li className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              5 giorni fa
            </Badge>
            tra {FRESH_DAYS} e {STALE_DAYS} giorni
          </li>
          <li className="flex items-center gap-2">
            <Badge variant="destructive">10 giorni fa</Badge> oltre {STALE_DAYS} giorni
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  )
}

interface SearchFiltersProps {
  mode: SearchMode
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  /** Su mobile i filtri secondari stanno in un drawer, per lasciare spazio ai risultati. */
  compact: boolean
}

function FuelSelect({ value, onChange }: { value: string; onChange: (fuel: string) => void }) {
  const { data: fuels } = useQuery({
    queryKey: ['carburanti'],
    queryFn: ({ signal }) => fetchFuels(signal),
    staleTime: 60 * 60 * 1000,
  })
  const otherFuels = (fuels ?? [])
    .filter((f) => !MAIN_FUEL_IDS.has(f.id) && f.impianti >= MIN_STATIONS_FOR_OTHER_FUELS)
    .map((f) => ({ value: f.id, label: f.nome }))
  // Il carburante salvato potrebbe non essere più tra gli "altri": lo mostriamo comunque.
  if (!MAIN_FUEL_IDS.has(value) && !otherFuels.some((f) => f.value === value)) {
    otherFuels.unshift({ value, label: value })
  }

  return (
    <Select
      items={[...MAIN_FUELS, ...otherFuels]}
      value={value}
      onValueChange={(next) => next && onChange(String(next))}
    >
      <SelectTrigger id="fuel" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {MAIN_FUELS.map((fuel) => (
            <SelectItem key={fuel.value} value={fuel.value}>
              {fuel.label}
            </SelectItem>
          ))}
        </SelectGroup>
        {otherFuels.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Altri carburanti</SelectLabel>
              {otherFuels.map((fuel) => (
                <SelectItem key={fuel.value} value={fuel.value}>
                  {fuel.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  )
}

function ResultsSelect({
  value,
  onChange,
}: {
  value: number
  onChange: (results: number) => void
}) {
  return (
    <Select
      items={RESULT_OPTIONS}
      value={String(value)}
      onValueChange={(next) => next && onChange(Number(next))}
    >
      <SelectTrigger id="results" className="w-20">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RESULT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RangeFilters({ mode, filters, onChange }: Omit<SearchFiltersProps, 'compact'>) {
  return (
    <>
      {mode === 'vicino' ? (
        <CommittedSlider
          id="radius"
          label="Raggio di ricerca"
          value={filters.radiusKm}
          min={1}
          max={50}
          format={(v) => `${v} km`}
          onCommit={(radiusKm) => onChange({ radiusKm })}
        />
      ) : (
        <CommittedSlider
          id="corridor"
          label="Distanza massima dal percorso"
          value={filters.corridorKm}
          min={0.5}
          max={10}
          step={0.5}
          format={(v) => `${v.toLocaleString('it-IT')} km`}
          onCommit={(corridorKm) => onChange({ corridorKm })}
        />
      )}
      <CommittedSlider
        id="max-age"
        label="Prezzi comunicati negli ultimi"
        hint={<FreshnessLegend />}
        value={filters.maxAgeDays}
        min={1}
        max={15}
        format={formatDays}
        onCommit={(maxAgeDays) => onChange({ maxAgeDays })}
      />
    </>
  )
}

function formatDays(days: number): string {
  return days === 1 ? '1 giorno' : `${days} giorni`
}

function filtersSummary(mode: SearchMode, filters: Filters): string {
  const distance =
    mode === 'vicino'
      ? `entro ${filters.radiusKm} km`
      : `a max ${filters.corridorKm.toLocaleString('it-IT')} km dal percorso`
  return `${filters.results} risultati ${distance}, prezzi degli ultimi ${formatDays(filters.maxAgeDays)}`
}

export function SearchFilters({ mode, filters, onChange, compact }: SearchFiltersProps) {
  if (compact) {
    return (
      <Field>
        <FieldLabel htmlFor="fuel">Carburante</FieldLabel>
        <div className="flex gap-2">
          <FuelSelect value={filters.fuel} onChange={(fuel) => onChange({ fuel })} />
          <Drawer>
            <DrawerTrigger render={<Button variant="outline" />}>
              <SlidersHorizontalIcon />
              Filtri
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Filtri</DrawerTitle>
              </DrawerHeader>
              <FieldGroup className="gap-6 overflow-y-auto p-4">
                <Field orientation="horizontal" className="justify-between">
                  <FieldLabel htmlFor="results">Numero di risultati</FieldLabel>
                  <ResultsSelect
                    value={filters.results}
                    onChange={(results) => onChange({ results })}
                  />
                </Field>
                <RangeFilters mode={mode} filters={filters} onChange={onChange} />
              </FieldGroup>
              <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
                <DrawerClose render={<Button />}>Fatto</DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
        <FieldDescription>{filtersSummary(mode, filters)}</FieldDescription>
      </Field>
    )
  }

  return (
    <FieldGroup className="gap-5">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field>
          <FieldLabel htmlFor="fuel">Carburante</FieldLabel>
          <FuelSelect value={filters.fuel} onChange={(fuel) => onChange({ fuel })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="results">Risultati</FieldLabel>
          <ResultsSelect value={filters.results} onChange={(results) => onChange({ results })} />
        </Field>
      </div>
      <RangeFilters mode={mode} filters={filters} onChange={onChange} />
    </FieldGroup>
  )
}
