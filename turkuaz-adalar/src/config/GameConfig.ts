/**
 * Gameplay tuning values. All distances are in metres, times in seconds.
 * The values are deliberately data-driven so later levels can override them.
 */
export const GAME_CONFIG = {
  player: {
    radius: 0.36,
    halfHeight: 0.42,
    gravity: -34,
    /** Peak height of a jump, in metres. Jump speed is derived from this. */
    jumpHeight: 1.9,
    maxFallSpeed: -42,
    coyoteTime: 0.1,
    jumpBufferTime: 0.12,
    /** Hard floor for the whole simulation; recovery happens above this. */
    killY: -8,
    startZ: 0,

    /**
     * Variable jump. Releasing the jump input while rising cuts the upward
     * velocity once, after a short grace period so a tap still reads as a
     * deliberate hop. A held key/pointer keeps the full configured height.
     */
    jumpCut: {
      enabled: true,
      graceTime: 0.08,
      velocityMultiplier: 0.5,
      minimumHeight: 0.6,
    },

    /**
     * Short obstacle slide. The capsule half-height shrinks for the duration,
     * which lets the runner pass under low beams. It is intentionally driven
     * by the same fixed step and lane controller as the rest of the movement.
     */
    slide: {
      duration: 0.62,
      /** Upper bound when a low ceiling prevents standing back up. */
      maxDuration: 1.2,
      cooldown: 0.28,
      /**
       * How long the runner may be reported airborne right after the capsule
       * shrinks. The collider teleport can drop ground contact for one step;
       * without this grace a slide would cancel itself immediately.
       */
      groundGrace: 0.1,
      /** Cylinder half-height while sliding (standing value is `halfHeight`). */
      halfHeight: 0.08,
      /** Small forward reward so sliding feels purposeful. */
      speedMultiplier: 1.14,
      /** Lateral authority while sliding, as a fraction of normal control. */
      laneControl: 0.65,
      /** Extra clearance used before restoring the standing capsule. */
      headroomMargin: 0.06,
      visualScaleY: 0.58,
      visualScaleXZ: 1.12,
    },

    /** Squash/stretch targets. The physical capsule never changes scale. */
    visual: {
      stretchY: 1.08,
      stretchXZ: 0.96,
      squashY: 0.84,
      squashXZ: 1.09,
      squashDuration: 0.2,
      damping: 20,
    },

    /** Falling below this absolute Y triggers checkpoint recovery. */
    fall: {
      recoverBelowY: -1.2,
      /** Respawn this far behind the checkpoint (+Z is behind the runner). */
      respawnOffsetZ: 2.2,
      cooldown: 0.9,
      invulnerability: 1.2,
    },

    /**
     * Logical lane movement. `track.lanePositions` defines lane centres; these
     * values define how the runner gets between them.
     */
    lane: {
      /** Maximum lateral speed while changing lanes, in m/s. */
      changeSpeed: 13,
      /** Lateral acceleration/deceleration, in m/s². */
      acceleration: 90,
      /** Fraction of speed and acceleration available while airborne. */
      airControl: 0.6,
      /** Proportional gain that eases the runner into the lane centre. */
      arrivalGain: 16,
      /** Distance at which the runner snaps onto the lane centre. */
      snapDistance: 0.02,
    },
  },

  track: {
    segmentLength: 30,
    segmentCount: 7,
    width: 9,
    topY: 2,
    baseThickness: 2.2,
    topThickness: 0.22,
    lanePositions: [-2.7, 0, 2.7] as const,
    recycleBehind: 16,
    decorationEdge: 3.95,
  },

  scoring: {
    distanceMultiplier: 1,
    crystalValue: 25,
  },

  /**
   * Collectible pickups. Coins and relic tokens feed the persistent wallet,
   * power-ups apply a timed modifier and caches grant a level reward. Every
   * pickup is pooled per prefab; nothing is allocated while the run streams.
   */
  collectibles: {
    heightAboveGround: 1.05,
    pickupRadius: 2.0,
    /** Extra vertical reach so a pickup is still collected mid-jump. */
    verticalTolerance: 1.05,
    bobHeight: 0.12,
    clusterSize: 3,
    clusterSpacing: 1.45,
    pool: {
      /** Idle instances created per prefab before the run starts. */
      prewarmPerKind: 4,
      /** Released instances kept warm before extra ones are disposed. */
      maxIdlePerKind: 24,
    },
    collection: {
      /** Length of the pop-and-rise animation before the instance is freed. */
      duration: 0.34,
      rise: 0.7,
      spin: 14,
      popScale: 1.45,
    },
    coins: {
      label: 'Gold Coin',
      /** Coins added to the persistent wallet. */
      value: 1,
      scoreValue: 8,
      /** Coin trails spawned per segment. */
      trailsMin: 3,
      trailsMax: 6,
      trailLengthMin: 5,
      trailLengthMax: 10,
      spacing: 1.35,
    },
    tokens: {
      label: 'Tide Relic',
      /** Rare token: a heavier wallet and score reward than a coin. */
      value: 5,
      scoreValue: 50,
      chance: 0.24,
    },
    powerUps: {
      /** Chance that a segment offers a single power-up pickup. */
      chance: 0.42,
      scoreValue: 15,
    },
    rewards: {
      label: 'Tide Cache',
      value: 40,
      scoreValue: 150,
      /** One cache every N segments, always with a power-up inside. */
      everySegments: 4,
      minSegmentIndex: 1,
    },
  },

  /**
   * Timed power-ups. `duration` is read at pickup time, so tuning a value here
   * changes both gameplay and the HUD timer without touching code.
   */
  powerUps: {
    shield: {
      label: 'Shield',
      duration: 12,
      /** Collisions absorbed before the shield ends. */
      charges: 1,
      /** Grace period after absorbing a hit, so the same contact cannot kill. */
      invulnerability: 0.9,
    },
    magnet: {
      label: 'Magnet',
      duration: 8,
      /** Radius around the runner that pulls coins and tokens. */
      radius: 5.5,
      /** Maximum attraction speed in m/s. */
      pullSpeed: 11,
    },
    speed: {
      label: 'Speed Boost',
      duration: 5,
      speedMultiplier: 1.45,
    },
    doubleJump: {
      label: 'Double Jump',
      duration: 12,
      /** Extra jumps allowed while airborne. */
      airJumps: 1,
    },
    glide: {
      label: 'Glide',
      duration: 10,
      /** Gravity multiplier: jumps float longer and land softer. */
      gravityScale: 0.55,
    },
    slowMo: {
      label: 'Slow Time',
      duration: 5,
      /** The whole run (speed, obstacles, the chasing wave) runs at this pace. */
      timeScale: 0.68,
    },
  },

  /**
   * Modular, pooled obstacle system. Every prefab owns its own module and
   * reads its tuning from this block. `unlockAt` is compared with the level's
   * 0..1 difficulty, so early segments only show readable barriers while the
   * later, motion-heavy obstacles ramp in.
   */
  obstacles: {
    pool: {
      /** Instances created ahead of time for each prefab. */
      prewarm: 1,
      /** Released instances kept warm before extra ones are disposed. */
      maxIdle: 4,
    },
    spawn: {
      /** Chance that a row blocks two lanes instead of one. */
      twoLaneChance: 0.34,
      /** Extra two-lane chance at maximum difficulty. */
      twoLaneDifficulty: 0.32,
      laneJitter: 0.14,
      zJitter: 0.6,
      /** Keeps static meshes clear of the segment edges. */
      edgeMargin: 7.5,
    },
    warning: {
      /** Default lead time for telegraphed motions. */
      leadTime: 0.8,
      /** Pulses per second for warning rings and lamps. */
      pulseSpeed: 6.5,
    },

    staticBarrier: {
      weight: 20,
      unlockAt: 0,
      variants: {
        crate: { weight: 6, unlockAt: 0 },
        spire: { weight: 4.5, unlockAt: 0.08 },
        beam: { weight: 1.8, unlockAt: 0.24 },
      },
    },
    rotatingBar: {
      weight: 8.5,
      unlockAt: 0.12,
      barLength: 3.4,
      barY: 0.86,
      barThickness: 0.2,
      angularSpeed: 1.55,
      radius: 1.9,
    },
    movingBlock: {
      weight: 8,
      unlockAt: 0.2,
      width: 1.35,
      height: 1.15,
      depth: 1.05,
      travel: 1.8,
      period: 3.2,
      radius: 1,
    },
    slidingObstacle: {
      weight: 8,
      unlockAt: 0.28,
      width: 0.95,
      height: 1.7,
      depth: 0.9,
      travel: 3.2,
      period: 2.8,
      radius: 0.86,
    },
    disappearingPlatform: {
      weight: 5,
      unlockAt: 0.36,
      width: 1.9,
      depth: 1.9,
      thickness: 0.32,
      lift: 0.52,
      visibleTime: 2.1,
      hiddenTime: 1.1,
      warningTime: 0.7,
      radius: 1.25,
    },
    timedGate: {
      weight: 7.5,
      unlockAt: 0.44,
      width: 2.35,
      height: 2.2,
      depth: 0.36,
      openTime: 1.8,
      closedTime: 1.5,
      warningTime: 0.7,
      /** Vertical travel of the lifting gate. */
      lift: 2.5,
      radius: 1.25,
    },
    movingPlatform: {
      weight: 5.5,
      unlockAt: 0.52,
      width: 2,
      depth: 1.8,
      thickness: 0.3,
      /** Minimum top lift above the deck. */
      baseLift: 0.2,
      travelX: 2.1,
      travelY: 0.5,
      period: 3.6,
      radius: 1.3,
    },
    fallingObject: {
      weight: 7,
      unlockAt: 0.6,
      size: 1.15,
      /** Centre height above the deck when the object is parked. */
      fallHeight: 5,
      fallTime: 0.42,
      restTime: 0.5,
      riseTime: 0.42,
      radius: 0.92,
    },
    bounceTrap: {
      weight: 5,
      unlockAt: 0.68,
      radius: 0.82,
      height: 2.6,
      thickness: 0.18,
      cooldown: 0.5,
    },
    laneBlocker: {
      weight: 10,
      unlockAt: 0.08,
      width: 2.2,
      height: 1.75,
      depth: 0.68,
      radius: 1.2,
    },
  },

  dash: {
    duration: 0.85,
    cooldown: 6,
    speedMultiplier: 1.7,
  },

  /**
   * Streaming track interactions. Spawn probabilities are per segment and are
   * rolled from the world's deterministic segment seed.
   */
  interactions: {
    /** Seconds before a pad can trigger again while it is still overlapped. */
    padCooldown: 0.5,
    /** Maximum height above a pad top that still counts as a touch. */
    padTriggerHeight: 0.9,
    bouncePad: {
      chance: 0.26,
      height: 3.2,
      radius: 0.72,
      thickness: 0.14,
    },
    speedPad: {
      chance: 0.22,
      effect: 'surge' as const,
      radius: 0.78,
      thickness: 0.1,
    },
    movingPlatform: {
      chance: 0.2,
      width: 2.3,
      depth: 2.4,
      thickness: 0.32,
      /** Minimum top lift above the deck so autostep can mount the platform. */
      baseLift: 0.14,
      amplitude: 0.55,
      period: 3.4,
      /** Extra random phase spread between platforms. */
      phaseJitter: 0.8,
    },
    checkpoint: {
      /** One marker every N segments (segment length is 30 m by default). */
      everySegments: 3,
      minDistance: 40,
    },
  },

  /**
   * Temporary movement effects. Every effect is a bundle of multipliers plus a
   * duration, so new pickups can be added without touching the player.
   */
  effects: {
    surge: {
      label: 'Tide Surge',
      duration: 4.5,
      speedMultiplier: 1.35,
      gravityScale: 1,
      jumpScale: 1,
      laneControl: 1.15,
      invulnerable: false,
    },
    recovery: {
      label: 'Recovered',
      duration: 1.4,
      speedMultiplier: 1,
      gravityScale: 1,
      jumpScale: 1,
      laneControl: 1,
      invulnerable: true,
    },
  },

  timing: {
    fixedDelta: 1 / 60,
    maxFrameDelta: 0.1,
    maxFixedSteps: 5,
    gameOverDelay: 0.8,
    hudUpdateInterval: 0.08,
  },
} as const
