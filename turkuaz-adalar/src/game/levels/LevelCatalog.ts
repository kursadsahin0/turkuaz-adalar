import type { LevelDefinition } from './LevelDefinition.ts'
import { LEVEL_1 } from './levels/Level1.ts'
import { LEVEL_2 } from './levels/Level2.ts'
import { LEVEL_3 } from './levels/Level3.ts'
import { LEVEL_4 } from './levels/Level4.ts'
import { LEVEL_5 } from './levels/Level5.ts'
import { LEVEL_6 } from './levels/Level6.ts'
import { LEVEL_7 } from './levels/Level7.ts'
import { LEVEL_8 } from './levels/Level8.ts'
import { LEVEL_9 } from './levels/Level9.ts'
import { LEVEL_10 } from './levels/Level10.ts'

/**
 * Complete level catalog for Turkuaz Adalar.
 * Levels are stored in separate files for maintainability.
 * Add new levels by importing them and appending to this array.
 */
export const LEVEL_CATALOG: readonly LevelDefinition[] = [
  LEVEL_1,
  LEVEL_2,
  LEVEL_3,
  LEVEL_4,
  LEVEL_5,
  LEVEL_6,
  LEVEL_7,
  LEVEL_8,
  LEVEL_9,
  LEVEL_10,
]
