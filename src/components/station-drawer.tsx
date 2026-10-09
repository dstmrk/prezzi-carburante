import { MapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { StationDetails } from '@/components/station-details'
import { stationTitle } from '@/lib/station'
import type { Station } from '@/lib/types'

interface StationDrawerProps {
  station: Station | null
  fuel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Mostrato solo quando la mappa non è già visibile. */
  onShowOnMap?: () => void
}

export function StationDrawer({
  station,
  fuel,
  open,
  onOpenChange,
  onShowOnMap,
}: StationDrawerProps) {
  return (
    <Drawer open={open && station !== null} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent>
        {station && (
          <>
            <DrawerHeader className="sr-only">
              <DrawerTitle>{stationTitle(station)}</DrawerTitle>
              <DrawerDescription>Dettagli del distributore</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto p-4">
              <StationDetails station={station} fuel={fuel} />
            </div>
            {onShowOnMap && (
              <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button variant="outline" onClick={onShowOnMap}>
                  <MapIcon />
                  Vedi sulla mappa
                </Button>
              </DrawerFooter>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
