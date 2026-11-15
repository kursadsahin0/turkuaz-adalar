import { t, tc } from '../../i18n/i18n.ts'
import type { LevelDefinition } from './LevelDefinition.ts'

/** The island's display name, e.g. "Event: Glacier Drift" for the weekly event. */
export function islandName(level: Pick<LevelDefinition, 'id' | 'name' | 'eventOf'>): string {
  if (level.eventOf) {
    return t('event.name', { island: tc(`level.${level.eventOf}.name`, level.name) })
  }
  return tc(`level.${level.id}.name`, level.name)
}
