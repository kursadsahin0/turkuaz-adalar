import type {
  CharacterDefinition,
  CharacterModelId,
  CosmeticType,
} from '../../game/characters/CharacterData.ts'
import { OUTFIT_PALETTES } from '../../game/characters/CharacterAppearance.ts'

/**
 * Small flat illustrations for the character screen, so every card shows
 * what it is: a cap looks like a cap, an outfit shows its colours. Drawn as
 * inline SVG (48×48), so they stay crisp and cost no asset downloads.
 */

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

/** Colours authored in Blender for the runner, used where an item keeps them. */
const BASE = {
  skin: '#f2b98c',
  hair: '#5b3826',
  jacket: '#18a8a1',
  jacketDark: '#0d7679',
  shorts: '#d9c69b',
  cream: '#f6e8cb',
  leather: '#7c4e35',
} as const

function svg(body: string, label: string): string {
  return `<svg class="cosmetic-icon" viewBox="0 0 48 48" role="img" aria-label="${label}">${body}</svg>`
}

/** Darkens a #rrggbb colour by `amount` (0–1). */
function shade(color: string, amount: number): string {
  const value = Number.parseInt(color.slice(1), 16)
  const channel = (shift: number): number => Math.round(((value >> shift) & 255) * (1 - amount))
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`
}

function jacket(color: string): string {
  const dark = shade(color, 0.3)
  return `
    <path d="M14 12 L20 8 Q24 12 28 8 L34 12 L41 21 L35 25 L33 22 L33 41 L15 41 L15 22 L13 25 L7 21 Z" fill="${color}"/>
    <path d="M20 8 Q24 14 28 8" fill="none" stroke="${dark}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M24 13 V41" stroke="${dark}" stroke-width="1.6"/>
    <rect x="17" y="27" width="5" height="4" rx="1.2" fill="${dark}"/>
    <rect x="26" y="27" width="5" height="4" rx="1.2" fill="${dark}"/>`
}

function droplet(color: string): string {
  return `
    <path d="M24 5 C24 5 11 20 11 29 A13 13 0 0 0 37 29 C37 20 24 5 24 5 Z" fill="${color}"/>
    <path d="M24 5 C24 5 11 20 11 29 A13 13 0 0 0 37 29 C37 20 24 5 24 5 Z" fill="none" stroke="${shade(color, 0.35)}" stroke-width="1.5"/>
    <ellipse cx="18.5" cy="27" rx="3" ry="5.5" fill="#ffffff" opacity="0.45" transform="rotate(20 18.5 27)"/>`
}

function outfit(id: string): string {
  const palette = OUTFIT_PALETTES[id]
  const shorts = palette ? hex(palette.shorts) : BASE.shorts
  const cream = palette ? hex(palette.cream) : BASE.cream
  const leather = palette ? hex(palette.leather) : BASE.leather
  return `
    <path d="M15 5 H33 L37 17 H11 Z" fill="${cream}"/>
    <path d="M20 5 L24 10 L28 5" fill="none" stroke="${shade(cream, 0.25)}" stroke-width="1.6"/>
    <rect x="11" y="17" width="26" height="5" rx="1.5" fill="${leather}"/>
    <rect x="21.5" y="17.5" width="5" height="4" rx="1" fill="#d99a2b"/>
    <path d="M11 22 H37 L39 42 H27.5 L24 28 L20.5 42 H9 Z" fill="${shorts}"/>
    <path d="M24 22 V28" stroke="${shade(shorts, 0.25)}" stroke-width="1.4"/>`
}

const ACCESSORIES: Readonly<Record<string, string>> = {
  'acc-none': `
    <circle cx="24" cy="24" r="15" fill="none" stroke="#7fb6ae" stroke-width="3"/>
    <path d="M13.5 34.5 L34.5 13.5" stroke="#7fb6ae" stroke-width="3" stroke-linecap="round"/>`,
  'acc-cap': `
    <path d="M9 30 A15 14 0 0 1 39 30 Z" fill="#c89b5a"/>
    <path d="M24 16 V30 M16 19 Q20 24 19 30 M32 19 Q28 24 29 30" fill="none" stroke="#a87d43" stroke-width="1.4"/>
    <path d="M30 30 H45 Q44 35 37 35 H30 Z" fill="#8f6a37"/>
    <circle cx="24" cy="15.5" r="2" fill="#8f6a37"/>`,
  'acc-goggles': `
    <path d="M3 25 Q24 19 45 25" fill="none" stroke="#2b2b33" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="15" cy="25" r="8.5" fill="#7fe8ff" stroke="#d99a2b" stroke-width="3"/>
    <circle cx="33" cy="25" r="8.5" fill="#7fe8ff" stroke="#d99a2b" stroke-width="3"/>
    <path d="M22 25 H26" stroke="#d99a2b" stroke-width="3"/>
    <path d="M10.5 22 Q13 19 16 20 M28.5 22 Q31 19 34 20" fill="none" stroke="#ffffff" stroke-width="1.6" opacity="0.8" stroke-linecap="round"/>`,
  'acc-bandana': `
    <path d="M7 15 H41 L24 40 Z" fill="#f4a259"/>
    <path d="M7 15 H41" stroke="#d9822b" stroke-width="3" stroke-linecap="round"/>
    <circle cx="18" cy="21" r="1.6" fill="#fff4e0"/><circle cx="30" cy="21" r="1.6" fill="#fff4e0"/>
    <circle cx="24" cy="28" r="1.6" fill="#fff4e0"/><circle cx="24" cy="21" r="1.6" fill="#fff4e0"/>
    <path d="M41 15 L46 11 M41 15 L45 20" stroke="#d9822b" stroke-width="2.6" stroke-linecap="round"/>`,
  'acc-backpack': `
    <rect x="10" y="5" width="28" height="9" rx="4.5" fill="#3f7d58"/>
    <path d="M14 5 V14 M34 5 V14" stroke="#2c5a3f" stroke-width="1.5"/>
    <rect x="12" y="13" width="24" height="29" rx="6" fill="#c9794b"/>
    <path d="M12 21 H36 V25 Q24 29 12 25 Z" fill="#9e5736"/>
    <rect x="18" y="31" width="12" height="7" rx="2" fill="#9e5736"/>`,
  'acc-wings': `
    <path d="M23 26 C17 10 6 8 2 13 C6 16 5 22 9 25 C6 29 10 34 15 32 C17 34 21 32 23 26 Z" fill="#f1faee" stroke="#b8d8d3" stroke-width="1.4"/>
    <path d="M25 26 C31 10 42 8 46 13 C42 16 43 22 39 25 C42 29 38 34 33 32 C31 34 27 32 25 26 Z" fill="#f1faee" stroke="#b8d8d3" stroke-width="1.4"/>
    <path d="M21 24 L9 15 M20 27 L10 25 M43 15 L27 24 M38 25 L28 27" stroke="#b8d8d3" stroke-width="1.2" stroke-linecap="round"/>`,
}

interface RunnerLook {
  readonly body: string
  readonly trim: string
  readonly hair: string
  readonly head: 'long' | 'hood' | 'beard' | 'wizard' | 'bun' | 'helmet' | 'short'
}

/** Each body's authored colours (see blender/build_kaykit_characters.py). */
const LOOKS: Readonly<Record<CharacterModelId, RunnerLook>> = {
  runner: { body: '#139c93', trim: '#35d3c4', hair: '#8a4b2e', head: 'long' },
  swift: { body: '#b82e3c', trim: '#e2574f', hair: '#e3b866', head: 'hood' },
  ocean: { body: '#2a6e9e', trim: '#3f8cc2', hair: '#d8d2c8', head: 'beard' },
  mage: { body: '#1f5f8b', trim: '#2ec4b6', hair: '#1b191b', head: 'wizard' },
  sage: { body: '#d9604a', trim: '#f2b36b', hair: '#1b191b', head: 'bun' },
  knight: { body: '#8d989d', trim: '#1fb5a8', hair: '#8d989d', head: 'helmet' },
  guardian: { body: '#8d989d', trim: '#e8a82e', hair: '#e6c48a', head: 'short' },
}

const SKIN = '#f6c9a3'
const EYES =
  '<circle cx="20.6" cy="19" r="1.25" fill="#1d2326"/><circle cx="27.4" cy="19" r="1.25" fill="#1d2326"/>'

function head(look: RunnerLook, hood: string): string {
  const face = `<circle cx="24" cy="18" r="8.6" fill="${SKIN}"/>`
  switch (look.head) {
    case 'long':
      return `<path d="M15 19 Q14 8 24 8 Q34 8 33 19 L33 26 L30 26 L30 16 Q24 13 18 16 L18 26 L15 26 Z" fill="${look.hair}"/>${face}<path d="M15.6 16 Q17 9 24 9.4 Q31 9 32.4 16 Q27 12.5 24 14 Q20 12.5 15.6 16 Z" fill="${look.hair}"/>${EYES}`
    case 'hood':
      return `<path d="M24 4 Q36 9 35 21 Q35 27 24 28 Q13 27 13 21 Q12 9 24 4 Z" fill="${hood}"/><circle cx="24" cy="19.5" r="7.4" fill="${SKIN}"/><path d="M17.6 16.5 Q20 13 24 14.5 Q28 13 30.4 16.5" fill="none" stroke="${look.hair}" stroke-width="2.2"/>${EYES}`
    case 'beard':
      return `${face}<path d="M16 19 Q16 29 24 30 Q32 29 32 19 Q28 23 24 22.5 Q20 23 16 19 Z" fill="${look.hair}"/><path d="M18.5 16.2 H22.4 M25.6 16.2 H29.5" stroke="${look.hair}" stroke-width="1.8" stroke-linecap="round"/>${EYES}`
    case 'wizard':
      return `${face}<path d="M17 15 Q18 10 24 10.5 Q30 10 31 15 Q27 13 24 13.5 Q21 13 17 15 Z" fill="${look.hair}"/><path d="M24 0.5 L17.5 11 L30.5 11 Z" fill="${hood}"/><ellipse cx="24" cy="11.2" rx="13" ry="2.8" fill="${hood}"/><rect x="18" y="8.6" width="12" height="2.2" fill="#e07a3c"/>${EYES}`
    case 'bun':
      return `<circle cx="24" cy="7" r="3.2" fill="${look.hair}"/>${face}<path d="M15.6 17 Q16 9.4 24 9.4 Q32 9.4 32.4 17 Q28 12.8 24 13.6 Q20 12.8 15.6 17 Z" fill="${look.hair}"/>${EYES}`
    case 'helmet':
      return `<path d="M15 21 Q14 8 24 7.5 Q34 8 33 21 Q33 27 24 27.5 Q15 27 15 21 Z" fill="${look.hair}"/><path d="M24 4 L26 8 L22 8 Z" fill="${shade(look.hair, 0.2)}"/><path d="M18 17 H30 Q30 23 24 23 Q18 23 18 17 Z" fill="${SKIN}"/><path d="M18 17 H30" stroke="${shade(look.hair, 0.35)}" stroke-width="1.6"/>${EYES.replaceAll('cy="19"', 'cy="19.6"')}`
    case 'short':
      return `${face}<path d="M15.6 17 Q15 9 24 9 Q33 9 32.4 17 Q29 12 24 12.6 Q19 12 15.6 17 Z" fill="${look.hair}"/>${EYES}`
  }
}

/** A chibi portrait of the runner: its own head (hood, hat, helmet...) and colours. */
function figure(character: CharacterDefinition, bodyColor: string | undefined): string {
  const look = LOOKS[character.build.model]
  const body = bodyColor ?? look.body
  const dark = shade(body, 0.28)
  const width = 15 * character.build.width
  const left = 24 - width / 2
  return `
    <path d="M${left - 1.5} 27 L${left + width + 1.5} 27 L${left + width + 3} 44 L${left - 3} 44 Z" fill="${shade(look.trim, 0.15)}"/>
    <rect x="${left}" y="26" width="${width}" height="13" rx="4" fill="${body}"/>
    <path d="M${left + 1} 33.5 H${left + width - 1}" stroke="#7c4e35" stroke-width="2.2"/>
    <rect x="22.6" y="32.4" width="2.8" height="2.4" rx="0.6" fill="#d9d9d9"/>
    <rect x="${left - 2.2}" y="27" width="3.4" height="9" rx="1.7" fill="${dark}"/>
    <rect x="${left + width - 1.2}" y="27" width="3.4" height="9" rx="1.7" fill="${dark}"/>
    <rect x="18.4" y="38" width="4.6" height="6" rx="1.6" fill="#7c4e35"/>
    <rect x="25" y="38" width="4.6" height="6" rx="1.6" fill="#7c4e35"/>
    ${head(look, body)}`
}

/**
 * Returns the SVG markup for an item. All values come from the game's own
 * catalogue (no user input), so building markup as a string is safe.
 */
export function cosmeticIcon(
  type: CosmeticType,
  item: { id: string; color?: number },
  label: string,
  character?: CharacterDefinition,
  characterColor?: number,
): string {
  switch (type) {
    case 'character':
      return character
        ? svg(
            figure(character, characterColor !== undefined ? hex(characterColor) : undefined),
            label,
          )
        : svg('', label)
    case 'skin':
      // The default skin keeps the authored jacket colour, not its swatch colour.
      return svg(
        jacket(item.id === 'skin-default' ? BASE.jacket : hex(item.color ?? 0x18a8a1)),
        label,
      )
    case 'color':
      return svg(
        droplet(item.id === 'color-default' ? '#f07c66' : hex(item.color ?? 0xf07c66)),
        label,
      )
    case 'outfit':
      return svg(outfit(item.id), label)
    case 'accessory':
      return svg(ACCESSORIES[item.id] ?? ACCESSORIES['acc-none'], label)
  }
}
