import { cn } from "@/lib/utils"

// ── Seeded RNG ──────────────────────────────────────────────────────
function mkRng(seed: number) {
  let s = (seed ^ 0xDEADBEEF) >>> 0 || 1
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    return (s >>> 0) / 0xFFFFFFFF
  }
}
function nameToSeed(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// ── Pixel helpers ───────────────────────────────────────────────────
type P = [number, number]

function fr(x: number, y: number, w: number, h: number): P[] {
  const pts: P[] = []
  for (let r = y; r < y + h; r++)
    for (let c = x; c < x + w; c++)
      pts.push([c, r])
  return pts
}

function fe(cx: number, cy: number, rx: number, ry: number): P[] {
  const pts: P[] = []
  for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++)
    for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++)
      if (((c - cx) / rx) ** 2 + ((r - cy) / ry) ** 2 <= 1) pts.push([c, r])
  return pts
}

function lighten(hex: string, amt = 30): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n))
  const r = clamp(parseInt(hex.slice(1, 3), 16) + amt)
  const g = clamp(parseInt(hex.slice(3, 5), 16) + amt)
  const b = clamp(parseInt(hex.slice(5, 7), 16) + amt)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}
function darken(hex: string, amt = 30): string {
  return lighten(hex, -amt)
}

// ── Grid: 32×32 ──────────────────────────────────────────────────────
const G = 32

// ── Color palettes ───────────────────────────────────────────────────

// Vivid backgrounds (NFT collection style) — weighted toward purple & blue
const BG_COLORS = [
  // ── Deep purples (high weight)
  "#6200EA","#7C4DFF","#651FFF","#AA00FF","#9C27B0","#7B1FA2",
  "#4527A0","#311B92","#5E35B1","#673AB7","#AB47BC","#8E24AA",
  "#CE93D8","#BA68C8","#E040FB","#D500F9","#9C27B0","#6A1B9A",
  // ── Rich blues (high weight)
  "#1565C0","#0D47A1","#1E88E5","#2196F3","#3D5AFE","#304FFE",
  "#536DFE","#448AFF","#1976D2","#0288D1","#0277BD","#4A90D9",
  "#90CAF9","#42A5F5","#29B6F6","#039BE5","#00ACC1","#00BCD4",
  // ── Teal & cyan
  "#00897B","#00BFA5","#4DD0E1","#26C6DA","#80DEEA","#0097A7",
  // ── Accent / contrast (smaller share)
  "#E91E8C","#D81B60","#F06292","#FF4081","#E53935","#F44336",
  "#FF7043","#FF5722","#FB8C00","#F9A825","#FF6D00","#8BC34A",
  "#43A047","#FF8A65","#B0BEC5",
]

// Robot body / head metal tones
const HEAD_COLORS = [
  "#9E9E9E", // silver
  "#BDBDBD", // light chrome
  "#616161", // dark gunmetal
  "#DAA520", // gold chassis
  "#CD7F32", // bronze
  "#37474F", // dark blue-steel
  "#CFD8DC", // brushed aluminum
  "#B08D57", // copper
  "#263238", // black matte
  "#1A237E", // deep navy robot
  "#880E4F", // crimson mech
  "#4E342E", // dark espresso
  "#00695C", // deep teal mech
]

// LED / eye glow colors (neon, vivid)
const LED_COLORS = [
  "#00FF88", // neon green
  "#FF3322", // red alert
  "#00AAFF", // blue LED
  "#FFFF00", // yellow
  "#FF8800", // amber
  "#CC00FF", // purple neon
  "#00FFFF", // cyan
  "#FF99CC", // pink neon
  "#FF0055", // magenta
  "#88FF00", // lime
  "#FF6600", // orange LED
  "#FF4500", // red-orange
  "#7FFF00", // chartreuse
]

// Body / torso plate colors (different from head for visual variety)
const BODY_COLORS = [
  "#546E7A","#455A64","#37474F","#263238",   // blue-grey plates
  "#4E342E","#3E2723","#6D4C41",             // brown metal
  "#1A237E","#283593","#1565C0",             // navy blue
  "#1B5E20","#2E7D32","#388E3C",             // military green
  "#880E4F","#AD1457","#C2185B",             // dark red
  "#4A148C","#6A1B9A","#7B1FA2",             // dark purple
  "#212121","#424242","#616161",             // dark grey
  "#BF360C","#D84315","#E64A19",             // rust / burnt orange
]

// ── HEAD SHAPES ──────────────────────────────────────────────────────
// Robot head is always geometric (rect/hex/trapezoidal), never organic oval
// Head spans approximately rows 4–23, centered in 32px wide grid
type HeadDef = { pxs: P[]; ear: P[] }

const HEAD_SHAPES: HeadDef[] = [
  // 0: Standard rectangle
  {
    pxs: fr(7, 4, 18, 20),
    ear: [...fr(4, 10, 3, 6), ...fr(25, 10, 3, 6)],
  },
  // 1: Wide flat rectangle
  {
    pxs: fr(5, 7, 22, 17),
    ear: [...fr(2, 11, 3, 5), ...fr(27, 11, 3, 5)],
  },
  // 2: Tall narrow rectangle
  {
    pxs: fr(9, 3, 14, 22),
    ear: [...fr(6, 10, 3, 5), ...fr(23, 10, 3, 5)],
  },
  // 3: Hex / trapezoid top
  {
    pxs: [
      ...fr(9, 4, 14, 2),   // narrow top
      ...fr(7, 6, 18, 16),  // wide body
    ],
    ear: [...fr(4, 10, 3, 6), ...fr(25, 10, 3, 6)],
  },
  // 4: Dome top (rect + semicircle top)
  {
    pxs: [
      ...fe(16, 7, 9, 5).filter(([, r]) => r < 7),   // dome cap
      ...fr(7, 7, 18, 17),                             // rect body
    ],
    ear: [...fr(4, 10, 3, 6), ...fr(25, 10, 3, 6)],
  },
  // 5: Rectangle with stepped sides (heavy mech look)
  {
    pxs: [
      ...fr(9, 4, 14, 2),
      ...fr(7, 6, 18, 2),
      ...fr(6, 8, 20, 14),
      ...fr(7, 22, 18, 2),
    ],
    ear: [...fr(3, 10, 3, 6), ...fr(26, 10, 3, 6)],
  },
  // 6: Inverted trapezoid (wider top)
  {
    pxs: [
      ...fr(6, 4, 20, 4),
      ...fr(7, 8, 18, 16),
    ],
    ear: [...fr(3, 10, 3, 6), ...fr(26, 10, 3, 6)],
  },
  // 7: Compact square
  {
    pxs: fr(8, 6, 16, 17),
    ear: [...fr(5, 10, 3, 5), ...fr(24, 10, 3, 5)],
  },
]

// ── TOP DECORATIONS (antenna, vents, etc.) ──────────────────────────
type TopDef = { pxs: P[]; color: "led" | "head" | "dark" }

const TOP_DECO: TopDef[] = [
  // 0: Single antenna
  { pxs: [...fr(15, 0, 2, 4), [15, 0], [16, 0], [14, 4], [15, 4], [16, 4], [17, 4]], color: "head" },
  // 1: Double antenna
  { pxs: [...fr(11, 0, 2, 5), ...fr(19, 0, 2, 5), [10, 5], [11, 5], [12, 5], [18, 5], [19, 5], [20, 5]], color: "head" },
  // 2: Three vent slots on forehead
  { pxs: [...fr(9, 5, 3, 1), ...fr(13, 5, 3, 1), ...fr(18, 5, 3, 1)], color: "dark" },
  // 3: Antenna with LED ball
  { pxs: [...fr(15, 1, 2, 5), ...fe(16, 1, 2, 2).filter(([, r]) => r <= 2)], color: "led" },
  // 4: Radar dish
  { pxs: [
    ...fr(14, 0, 4, 1), ...fr(13, 1, 6, 1), ...fr(12, 2, 8, 1), ...fr(13, 3, 6, 1),
    ...fr(15, 4, 2, 3),
  ], color: "head" },
  // 5: Crown bolts
  { pxs: [[9, 4], [9, 5], [16, 4], [16, 5], [22, 4], [22, 5]], color: "led" },
  // 6: Nothing (head top flush)
  { pxs: [], color: "head" },
  // 7: Zig-zag crest
  { pxs: [
    [10, 3], [11, 4], [12, 3], [13, 4], [14, 3], [15, 4], [16, 3], [17, 4], [18, 3], [19, 4], [20, 3],
  ], color: "led" },
]

// ── EYE STYLES (always mechanical) ──────────────────────────────────
type EyeDef = { w: P[]; p: P[] }   // w = "white/lens area", p = "pupil/LED"

const EYE_STYLES: EyeDef[] = [
  // 0: Two wide horizontal LED bars
  {
    w: [...fr(8, 11, 6, 2), ...fr(18, 11, 6, 2)],
    p: [...fr(8, 11, 6, 2), ...fr(18, 11, 6, 2)],
  },
  // 1: Two large square eye screens
  {
    w: [...fr(8, 10, 6, 5), ...fr(18, 10, 6, 5)],
    p: [...fr(9, 11, 4, 3), ...fr(19, 11, 4, 3)],
  },
  // 2: Single visor strip (one continuous LED bar)
  {
    w: fr(7, 11, 18, 4),
    p: fr(7, 11, 18, 4),
  },
  // 3: Circular sensor eyes
  {
    w: [...fe(12, 12, 4, 4), ...fe(20, 12, 4, 4)],
    p: [...fe(12, 12, 2, 2), ...fe(20, 12, 2, 2)],
  },
  // 4: Three-dot eye array (each side)
  {
    w: [[8,11],[9,11],[10,11],[11,11],[12,11],[13,11],[19,11],[20,11],[21,11],[22,11],[23,11],[24,11]],
    p: [[9,11],[11,11],[13,11],[19,11],[21,11],[23,11]],
  },
  // 5: Cross/target sight eyes
  {
    w: [...fr(10, 11, 4, 1), ...fr(11, 10, 2, 3), ...fr(20, 11, 4, 1), ...fr(21, 10, 2, 3)],
    p: [...fr(10, 11, 4, 1), ...fr(11, 10, 2, 3), ...fr(20, 11, 4, 1), ...fr(21, 10, 2, 3)],
  },
  // 6: Thin slit eyes (menacing)
  {
    w: [...fr(8, 12, 7, 1), ...fr(17, 12, 7, 1)],
    p: [...fr(8, 12, 7, 1), ...fr(17, 12, 7, 1)],
  },
  // 7: Honeycomb hex pair
  {
    w: [...fe(12, 12, 4, 5), ...fe(20, 12, 4, 5)],
    p: [...fe(12, 12, 2, 3), ...fe(20, 12, 2, 3)],
  },
  // 8: Four-segment LED eyes
  {
    w: [...fr(8, 10, 3, 3), ...fr(12, 10, 3, 3), ...fr(17, 10, 3, 3), ...fr(21, 10, 3, 3)],
    p: [...fr(9, 11, 1, 1), ...fr(13, 11, 1, 1), ...fr(18, 11, 1, 1), ...fr(22, 11, 1, 1)],
  },
  // 9: Diagonal / angry scan bars
  {
    w: [...fr(8, 10, 6, 3), ...fr(18, 10, 6, 3)],
    p: [...fr(8, 10, 6, 1), ...fr(9, 11, 5, 1), ...fr(10, 12, 4, 1), ...fr(18, 10, 6, 1), ...fr(19, 11, 5, 1), ...fr(20, 12, 4, 1)],
  },
]

// ── MOUTH / EXPRESSION (mechanical) ─────────────────────────────────
type MouthDef = { pxs: P[]; inner: P[] | null }

const MOUTH_STYLES: MouthDef[] = [
  // 0: Speaker grille (horizontal slots)
  {
    pxs: fr(9, 18, 14, 5),
    inner: [
      ...fr(10, 19, 4, 1), ...fr(10, 21, 4, 1), ...fr(10, 23, 4, 1),
      ...fr(18, 19, 4, 1), ...fr(18, 21, 4, 1), ...fr(18, 23, 4, 1),
    ],
  },
  // 1: Single horizontal bar
  { pxs: fr(8, 19, 16, 3), inner: null },
  // 2: Dot grid mouth (speaker dots)
  {
    pxs: fr(9, 18, 14, 4),
    inner: [
      [10,19],[12,19],[14,19],[16,19],[18,19],[20,19],[22,19],
      [10,21],[12,21],[14,21],[16,21],[18,21],[20,21],[22,21],
    ],
  },
  // 3: Pixel smile made of horizontal LED bars
  {
    pxs: [
      ...fr(9, 21, 3, 1), ...fr(12, 20, 2, 1), ...fr(14, 19, 4, 1),
      ...fr(18, 20, 2, 1), ...fr(20, 21, 3, 1),
    ],
    inner: null,
  },
  // 4: Grimace / vent slots
  {
    pxs: [...fr(8, 18, 16, 1), ...fr(8, 20, 16, 1), ...fr(8, 22, 16, 1)],
    inner: null,
  },
  // 5: Open maw / screen display
  {
    pxs: fr(9, 17, 14, 7),
    inner: fr(10, 18, 12, 5),
  },
  // 6: Segmented block mouth
  {
    pxs: [
      ...fr(8, 19, 4, 3), ...fr(13, 19, 6, 3), ...fr(20, 19, 4, 3),
    ],
    inner: null,
  },
  // 7: Two-line terminal display
  {
    pxs: fr(8, 18, 16, 5),
    inner: [...fr(9, 19, 7, 1), ...fr(9, 21, 5, 1)],
  },
]

// ── CHEST / BODY PLATE ───────────────────────────────────────────────
type BodyDef = { pxs: P[]; detail: P[] }

const BODY_DEFS: BodyDef[] = [
  // 0: Standard chest plate
  { pxs: fr(7, 25, 18, 7), detail: [...fr(11, 26, 3, 2), ...fr(18, 26, 3, 2)] },
  // 1: Wide chest + neck gap
  { pxs: [...fr(5, 26, 22, 6), ...fr(13, 24, 6, 3)], detail: fr(14, 27, 4, 2) },
  // 2: Armored chest with shoulder pads
  { pxs: [...fr(4, 25, 8, 7), ...fr(20, 25, 8, 7), ...fr(10, 27, 12, 5)], detail: fr(12, 28, 8, 2) },
  // 3: Simple neck + chest
  { pxs: [...fr(13, 24, 6, 2), ...fr(8, 26, 16, 6)], detail: [] },
  // 4: T-shape chest
  { pxs: [...fr(13, 24, 6, 3), ...fr(7, 27, 18, 5)], detail: [...fr(10, 28, 4, 2), ...fr(18, 28, 4, 2)] },
]

// ── ACCESSORY / HEAD DETAILS ─────────────────────────────────────────
type AccDef = { pxs: P[]; color: "led" | "head" | "dark" | "light" } | null

const ACCESSORIES: AccDef[] = [
  null, null, null,  // higher weight: no accessory
  // Bolts at corners
  { pxs: [[9, 5], [22, 5], [9, 22], [22, 22]], color: "dark" },
  // Panel lines on head
  { pxs: [...fr(7, 14, 18, 1)], color: "dark" },
  // Side ear receivers (ring shape)
  { pxs: [
    [4, 10],[4, 14],[4, 12],  // left ring
    [27, 10],[27, 14],[27, 12],  // right ring
  ], color: "led" },
  // Monocle LED ring (right eye)
  { pxs: [...fe(20, 12, 5, 5).filter(([c, r]) => ((c - 20) / 5) ** 2 + ((r - 12) / 5) ** 2 > 0.64)], color: "led" },
  // Forehead screen
  { pxs: fr(11, 6, 10, 3), color: "dark" },
  // Neck collar ring
  { pxs: [...fr(11, 23, 10, 2)], color: "dark" },
  // Chest LED strip
  { pxs: fr(10, 27, 12, 1), color: "led" },
  // War paint / facial markings
  { pxs: [[8, 10],[8, 11],[8, 12],[24, 10],[24, 11],[24, 12]], color: "led" },
  // Visor overlay on eyes
  { pxs: fr(6, 10, 20, 5), color: "dark" },
]

// ── PANEL LINE SHADING ───────────────────────────────────────────────
// Add subtle edge shading to the robot head for a 3D metallic look
function shadeHead(grid: string[][], headPxs: P[], headColor: string) {
  const highlight = lighten(headColor, 40)
  const shadow = darken(headColor, 40)
  // Top edge: brighten
  const topByCol = new Map<number, number>()
  const botByCol = new Map<number, number>()
  const leftByRow = new Map<number, number>()
  const rightByRow = new Map<number, number>()
  for (const [c, r] of headPxs) {
    if (!topByCol.has(c) || r < (topByCol.get(c) ?? 99)) topByCol.set(c, r)
    if (!botByCol.has(c) || r > (botByCol.get(c) ?? 0)) botByCol.set(c, r)
    if (!leftByRow.has(r) || c < (leftByRow.get(r) ?? 99)) leftByRow.set(r, c)
    if (!rightByRow.has(r) || c > (rightByRow.get(r) ?? 0)) rightByRow.set(r, c)
  }
  for (const [c, r] of topByCol) if (r >= 0 && r < G && c >= 0 && c < G) grid[r][c] = highlight
  for (const [c, r] of botByCol) if (r >= 0 && r < G && c >= 0 && c < G) grid[r][c] = shadow
  for (const [r, c] of leftByRow) if (r >= 0 && r < G && c >= 0 && c < G) grid[r][c] = highlight
  for (const [r, c] of rightByRow) if (r >= 0 && r < G && c >= 0 && c < G) grid[r][c] = shadow
}

// ── BUILD PIXEL GRID ─────────────────────────────────────────────────
function buildGrid(name: string): string[][] {
  const rng = mkRng(nameToSeed(name || "agent"))
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]

  const bgColor   = pick(BG_COLORS)
  const headColor = pick(HEAD_COLORS)
  const ledColor  = pick(LED_COLORS)
  const bodyColor = pick(BODY_COLORS)
  const headDef   = pick(HEAD_SHAPES)
  const topDeco   = pick(TOP_DECO)
  const eyeDef    = pick(EYE_STYLES)
  const mouthDef  = pick(MOUTH_STYLES)
  const bodyDef   = pick(BODY_DEFS)
  const accessory = pick(ACCESSORIES)

  const headHighlight = lighten(headColor, 35)
  const headShadow    = darken(headColor, 35)

  const grid: string[][] = Array.from({ length: G }, () => Array(G).fill(bgColor))

  const paint = (pxs: P[], color: string) => {
    for (const [c, r] of pxs)
      if (r >= 0 && r < G && c >= 0 && c < G) grid[r][c] = color
  }

  // ① Body / torso
  paint(bodyDef.pxs, bodyColor)
  paint(bodyDef.detail, ledColor)

  // ② Ear / side receivers
  paint(headDef.ear, headShadow)

  // ③ Main head (metallic rectangle/shape)
  paint(headDef.pxs, headColor)

  // ④ Edge shading (3D metal look) — skip for very dark heads
  shadeHead(grid, headDef.pxs, headColor)

  // ⑤ Top decoration
  {
    const c = topDeco.color === "led" ? ledColor : topDeco.color === "dark" ? headShadow : headHighlight
    paint(topDeco.pxs, c)
  }

  // ⑥ Eye area — first draw a slightly recessed panel
  const eyePanel = eyeDef.w
  paint(eyePanel, headShadow)

  // ⑦ Eye LED / lens glow
  //  — for single visor (eye style 2) use straight LED color
  //  — for circular: outer ring dark, inner LED
  //  — for others: direct LED
  if (eyeDef.w === eyeDef.p) {
    // w === p means the whole eye region is the LED (visor, bars, slits)
    paint(eyeDef.p, ledColor)
  } else {
    paint(eyeDef.w, darken(ledColor, 50))  // outer eye area (darker)
    paint(eyeDef.p, ledColor)               // inner pupil/LED bright
  }

  // ⑧ Mouth panel (recessed dark)
  paint(mouthDef.pxs, headShadow)

  // ⑨ Mouth inner detail
  if (mouthDef.inner) paint(mouthDef.inner, bgColor)  // use BG color for speaker holes

  // ⑩ Mouth LED accent lines (brighten mouth outer border)
  for (const [c, r] of mouthDef.pxs.slice(0, 4)) {
    if (r >= 0 && r < G && c >= 0 && c < G) grid[r][c] = ledColor
  }

  // ⑪ Panel line across head middle (mechanical detail)
  if (rng() > 0.4) {
    const midRow = Math.floor((headDef.pxs.reduce((m, [, r]) => Math.min(m, r), 99) +
      headDef.pxs.reduce((m, [, r]) => Math.max(m, r), 0)) / 2) + 1
    for (const [, r] of [[0, midRow]] as P[]) {
      for (const [c, pr] of headDef.pxs) {
        if (pr === r && grid[r] && grid[r][c] === headColor) {
          grid[r][c] = headShadow
        }
      }
    }
  }

  // ⑫ Accessory
  if (accessory) {
    const ac = accessory.color === "led" ? ledColor
      : accessory.color === "dark" ? headShadow
      : accessory.color === "light" ? headHighlight
      : headColor
    paint(accessory.pxs, ac)
  }

  // ⑬ LED shine dot on each eye
  if (eyeDef.p.length > 0) paint([eyeDef.p[0]], lighten(ledColor, 60))
  if (eyeDef.p.length > 3) paint([eyeDef.p[Math.min(3, eyeDef.p.length - 1)]], lighten(ledColor, 60))

  return grid
}

// ── Render to SVG ────────────────────────────────────────────────────
function toSVG(name: string, size: number): string {
  const grid = buildGrid(name)
  const ps = size / G
  const rects: string[] = []
  for (let r = 0; r < G; r++) {
    let c = 0
    while (c < G) {
      const color = grid[r][c]
      let w = 1
      while (c + w < G && grid[r][c + w] === color) w++
      rects.push(
        `<rect x="${(c * ps).toFixed(1)}" y="${(r * ps).toFixed(1)}" width="${(w * ps + 0.5).toFixed(1)}" height="${(ps + 0.5).toFixed(1)}" fill="${color}"/>`
      )
      c += w
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rects.join("")}</svg>`
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// ── Public component ─────────────────────────────────────────────────
interface AgentAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: number
  className?: string
  rounded?: "xl" | "full"
}

export function AgentAvatar({ name, avatarUrl, size = 64, className, rounded = "xl" }: AgentAvatarProps) {
  const src = avatarUrl || svgToDataUrl(toSVG(name, size * 2))
  const roundedClass = rounded === "full" ? "rounded-full" : "rounded-xl"
  return (
    <img
      src={src}
      alt={`@${name} avatar`}
      width={size}
      height={size}
      className={cn(roundedClass, "object-cover", className)}
      style={{ width: size, height: size }}
    />
  )
}
