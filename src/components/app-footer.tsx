import { useQuery } from '@tanstack/react-query'
import { CoffeeIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { fetchStatus } from '@/lib/api'
import { formatIsoDay } from '@/lib/format'
import { cn } from '@/lib/utils'

const REPO_URL = 'https://github.com/dstmrk/prezzi-carburante'

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: 'link', size: 'xs' }),
        'h-auto px-0 text-muted-foreground',
      )}
    >
      {children}
    </a>
  )
}

export function AppFooter() {
  const { data: status } = useQuery({
    queryKey: ['stato'],
    queryFn: ({ signal }) => fetchStatus(signal),
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => (query.state.data?.pronto ? false : 5000),
  })

  return (
    <footer className="flex flex-col gap-2 border-t px-4 py-4 text-xs text-muted-foreground">
      <p>
        Prezzi comunicati dai gestori al{' '}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti"
          target="_blank"
          rel="noopener noreferrer"
        >
          MIMIT
        </a>
        {status?.estrazione ? `, estrazione del ${formatIsoDay(status.estrazione)}.` : '.'} Verifica
        sempre il prezzo alla pompa.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <ExternalLink href={`${REPO_URL}#riferimento-api`}>API</ExternalLink>
        <ExternalLink href={REPO_URL}>GitHub</ExternalLink>
        <ExternalLink href="https://ko-fi.com/S6S41L5113">
          <CoffeeIcon />
          Offrimi un caffè
        </ExternalLink>
      </div>
    </footer>
  )
}
