/**
 * Per-island art direction on top of the sky/fog theme: the coloured track
 * tiles, the sea and the foliage. Keyed by `LevelTheme.id`. The first island
 * (and the endless run) keeps the authored palette, so it has no entry.
 */
export interface IslandLook {
  /** Colour of the accent checker tiles (the white tiles stay white). */
  readonly trackAccent: number
  readonly oceanDeep: number
  readonly oceanShallow: number
  /** Foliage tint; leaves keep their light/dark shading. */
  readonly foliage: number
}

export const ISLAND_LOOKS: Readonly<Record<string, IslandLook>> = {
  // Azure Rapids: bright blue water and lush green.
  rapids: { trackAccent: 0x4fb8ff, oceanDeep: 0x0a4f8a, oceanShallow: 0x3fb8e8, foliage: 0x6fcf7f },
  // Sapphire Depths: deep sapphire sea, sea-green palms.
  depths: { trackAccent: 0x3f7fd9, oceanDeep: 0x062e5c, oceanShallow: 0x1f6fb0, foliage: 0x3f9f8a },
  // Crystal Peaks: amethyst track, frosted leaves, cold sea.
  peaks: { trackAccent: 0xb39ddb, oceanDeep: 0x2e3a6b, oceanShallow: 0x6b8fd1, foliage: 0x9fc8b8 },
  // Amber Horizon: sunset track and autumn trees.
  horizon: {
    trackAccent: 0xffb74d,
    oceanDeep: 0x1f5a6e,
    oceanShallow: 0x5fb0a8,
    foliage: 0xd8b04a,
  },
  // Rose Valley: blossom-pink trees.
  valley: { trackAccent: 0xf48fb1, oceanDeep: 0x2f6f7a, oceanShallow: 0x6fd0c8, foliage: 0xf2a0c0 },
  // Mint Archipelago: mint everything.
  archipelago: {
    trackAccent: 0x6ee7b7,
    oceanDeep: 0x0b6b5e,
    oceanShallow: 0x44d9b8,
    foliage: 0x5fd38a,
  },
  // Laventa Twilight: lavender dusk.
  twilight: {
    trackAccent: 0xa78bfa,
    oceanDeep: 0x2a1f5c,
    oceanShallow: 0x5b4fb0,
    foliage: 0x8f7fd0,
  },
  // Coral Core: coral reef colours.
  core: { trackAccent: 0xff8a65, oceanDeep: 0x12445a, oceanShallow: 0x3fa6a0, foliage: 0xe57373 },
  // Void Walker: deep night.
  void: { trackAccent: 0x5c6bc0, oceanDeep: 0x0b0f2a, oceanShallow: 0x1f2a5c, foliage: 0x4a5a8a },
  // Sunken Ruins: sandstone track, moss and a murky teal lagoon.
  ruins: { trackAccent: 0xc9b48a, oceanDeep: 0x123f45, oceanShallow: 0x3f8f86, foliage: 0x7f9a5a },
  // Storm Reef: slate track, dark churning sea.
  storm: { trackAccent: 0x7f8fa6, oceanDeep: 0x1b2a3a, oceanShallow: 0x3e5a70, foliage: 0x4f7a6a },
  // Glacier Drift: ice-blue track, pale sea, frosted pines.
  glacier: {
    trackAccent: 0x9fd8f5,
    oceanDeep: 0x2b6f9e,
    oceanShallow: 0x8fd3f0,
    foliage: 0xd8eef5,
  },
  // Volcano Rim: ember track, black sea, scorched trees.
  volcano: {
    trackAccent: 0xff6a3d,
    oceanDeep: 0x1a0f12,
    oceanShallow: 0x5a2a22,
    foliage: 0x5a3a2a,
  },
  // Aurora Crown: green-violet aurora palette over a night sea.
  aurora: { trackAccent: 0x5df2b0, oceanDeep: 0x071a33, oceanShallow: 0x1f4f7a, foliage: 0x7a6af0 },
  // Mangrove Maze
  mangrove: {
    trackAccent: 0x8fbf6a,
    oceanDeep: 0x1c4a3a,
    oceanShallow: 0x4f9a78,
    foliage: 0x3f8a4a,
  },
  // Pearl Bay
  pearl: { trackAccent: 0xf2e6d8, oceanDeep: 0x2a7f9e, oceanShallow: 0x7fd3e0, foliage: 0x9ed0a8 },
  // Sandstorm Dunes
  dunes: { trackAccent: 0xe8b46a, oceanDeep: 0x5a7a8a, oceanShallow: 0xb8c8a8, foliage: 0xb0a050 },
  // Kelp Forest
  kelp: { trackAccent: 0x4fae7a, oceanDeep: 0x0c3a35, oceanShallow: 0x2f8a70, foliage: 0x2f9a5a },
  // Thunder Cliffs
  cliffs: { trackAccent: 0x9aa6b8, oceanDeep: 0x15202e, oceanShallow: 0x3a4a60, foliage: 0x5a7060 },
  // Moonlit Atoll
  atoll: { trackAccent: 0xb8c8f0, oceanDeep: 0x0a1530, oceanShallow: 0x22406a, foliage: 0x4a6aa0 },
  // Jade Temple
  jade: { trackAccent: 0x5fd0a0, oceanDeep: 0x0e4a40, oceanShallow: 0x3fa08a, foliage: 0x6ab070 },
  // Sunset Lagoon
  sunset: { trackAccent: 0xffb070, oceanDeep: 0x3a3a6a, oceanShallow: 0xe08a7a, foliage: 0xd08a5a },
  // Frost Fjord
  fjord: { trackAccent: 0xc8e8f8, oceanDeep: 0x1a4a70, oceanShallow: 0x6aa8d0, foliage: 0xc0d8e0 },
  // Ember Isles
  ember: { trackAccent: 0xff7a3a, oceanDeep: 0x1a0a08, oceanShallow: 0x6a2a1a, foliage: 0x6a3a20 },
  // Starfall Reef
  starfall: {
    trackAccent: 0xf0d070,
    oceanDeep: 0x060a20,
    oceanShallow: 0x1a2a5a,
    foliage: 0x5a5ab0,
  },
  // Tidal Citadel
  citadel: {
    trackAccent: 0xb0a890,
    oceanDeep: 0x203a50,
    oceanShallow: 0x5a7a90,
    foliage: 0x6a8a6a,
  },
  // Nebula Shoals
  nebula: { trackAccent: 0xd07af0, oceanDeep: 0x12082a, oceanShallow: 0x4a2a8a, foliage: 0x8a5ad0 },
  // Obsidian Spire
  obsidian: {
    trackAccent: 0x8a7af0,
    oceanDeep: 0x050508,
    oceanShallow: 0x2a2a40,
    foliage: 0x3a3a50,
  },
  // Turquoise Throne
  throne: { trackAccent: 0x40e0d0, oceanDeep: 0x0a4a55, oceanShallow: 0x2ab8b0, foliage: 0x3ad0a0 },
}
