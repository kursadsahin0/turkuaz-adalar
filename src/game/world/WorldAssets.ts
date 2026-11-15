import { IslandAssets } from '../platforms/IslandAssets.ts'
import { PlatformAssets } from '../platforms/PlatformAssets.ts'
import { FloatingIslandAssets } from './islands/FloatingIsland.ts'
import { VegetationAssets } from './vegetation/VegetationAssets.ts'
import { WaterfallAssets } from './waterfalls/Waterfall.ts'

/**
 * Owns every GPU resource shared by the streamed track and the surroundings.
 * Creating these once keeps recycling allocation-free and makes teardown a
 * single, explicit step at the end of the world's life.
 */
export class WorldAssets {
  readonly platform = new PlatformAssets()
  readonly island = new IslandAssets()
  readonly floating = new FloatingIslandAssets()
  readonly vegetation = new VegetationAssets()
  readonly waterfalls = new WaterfallAssets()

  update(elapsed: number): void {
    this.waterfalls.update(elapsed)
  }

  dispose(): void {
    this.waterfalls.dispose()
    this.vegetation.dispose()
    this.floating.dispose()
    this.island.dispose()
    this.platform.dispose()
  }
}
