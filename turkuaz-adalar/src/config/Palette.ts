/**
 * Central colour palette. Every colour used by the 3D scene is defined here so
 * that art direction stays consistent across the world, player and UI.
 */
export const PALETTE = {
  skyTop: 0x0a5d78,
  skyHorizon: 0xffd9a6,
  skySun: 0xfff1c9,
  fog: 0x9fe3d9,

  oceanDeep: 0x075160,
  oceanShallow: 0x2fc8bd,
  oceanFoam: 0xc9fff6,

  sand: 0xf1d29a,
  sandShade: 0xd9b377,
  sandLight: 0xfff0cc,
  rock: 0x2b6c72,
  rockLight: 0x3d8b8c,
  rockDark: 0x1b4b53,

  grass: 0x4fc47b,
  grassLight: 0x7fe19b,
  grassDark: 0x2b9b67,

  foliage: 0x2e9e6b,
  foliageLight: 0x5ecb8b,
  foliageDark: 0x1b7356,
  foliageSun: 0x9af0b4,
  trunk: 0x8d6042,
  trunkDark: 0x6e4936,

  platformWhite: 0xf7fffd,
  platformTurquoise: 0x38d8ce,
  platformTurquoiseDeep: 0x149c9e,
  platformTrim: 0x0f7f84,
  platformShade: 0xb9eee6,
  mechanismYellow: 0xffd35c,
  mechanismGold: 0xe8a72f,
  mechanismGlow: 0xfff0b0,

  waterfall: 0xc9fff8,
  waterfallDeep: 0x4be3db,
  waterfallFoam: 0xf0fffb,

  flowerPink: 0xff9fbc,
  flowerCoral: 0xff8168,
  flowerYellow: 0xffdb72,

  cloud: 0xfff7e8,
  cloudShade: 0xdff2ee,
  horizonIsland: 0x5ba9a6,

  player: 0x7ff6e6,
  playerDeep: 0x1aa6a3,
  playerGlow: 0x52fff0,
  playerAccent: 0xff8168,

  crate: 0xc96a4c,
  crateDark: 0x8f3f2f,
  crateStrap: 0xf2c46d,
  spire: 0x1a7c8e,
  spireGlow: 0x48f0e2,

  crystal: 0x7bfff3,
  crystalCore: 0x1fe2d2,

  coin: 0xffd35c,
  coinDeep: 0xe8a72f,
  coinLight: 0xfff0b0,
  powerShield: 0x6fdcff,
  powerMagnet: 0xff8168,
  powerSpeed: 0xffe066,
  powerDoubleJump: 0xb98cff,
  powerGlide: 0x9ff3ff,
  powerSlowMo: 0xff9ed8,
  reward: 0xffc94d,

  sun: 0xfff0cf,
  fill: 0x74d8d0,
} as const

/** Colours consumed by CSS custom properties in `style.css`. */
export const CSS_PALETTE = {
  ink: '#041a20',
  deep: '#062c36',
  turquoise: '#61f5e3',
  mint: '#a8ffe9',
  sand: '#f1d29a',
  coral: '#ff8168',
} as const
