/* Logo do MAI: curvas de nível de uma montanha vista de cima.
 * A cor acompanha o tema escolhido em Configurações > Aparência (só as cores principais, sem versão escura). */
import { THEMES, normalizeTheme } from './theme'

export const LOGO_RINGS = [
  'M440.2 206.2C452.1 227.2 466.8 255.3 462.1 279.4C457.4 303.5 430.4 327.6 412 350.8C393.5 374.1 377.4 406.6 351.4 418.8C325.3 430.9 286.7 420.9 255.6 423.6C224.6 426.3 189.2 442.2 165.3 435C141.3 427.7 132.2 396.7 112.1 380C92 363.3 54.4 355.2 44.6 334.7C34.8 314.3 44 281.3 53.3 257.5C62.7 233.6 84.3 214.3 100.6 191.6C116.9 168.9 127.4 135 151.3 121.3C175.3 107.5 213.5 112.8 244.2 109.1C274.9 105.5 311.1 92.1 335.5 99.5C360 106.9 373.5 135.8 390.9 153.6C408.4 171.4 428.3 185.2 440.2 206.2Z',
  'M396.9 213.2C405.3 227.9 415.6 247.6 412.3 264.5C409 281.3 390.1 298.2 377.2 314.5C364.3 330.8 353 353.5 334.8 362C316.5 370.5 289.5 363.5 267.7 365.4C246 367.3 221.2 378.5 204.5 373.4C187.7 368.3 181.3 346.6 167.3 334.9C153.2 323.2 126.9 317.5 120 303.2C113.1 288.9 119.6 265.8 126.1 249.1C132.7 232.4 147.8 218.9 159.2 203C170.7 187.1 178 163.4 194.7 153.8C211.5 144.2 238.3 147.8 259.8 145.3C281.3 142.8 306.6 133.3 323.7 138.5C340.8 143.7 350.2 164 362.4 176.4C374.7 188.9 388.6 198.6 396.9 213.2Z',
  'M374.4 211.7C380.2 222 387.4 235.8 385.1 247.6C382.8 259.4 369.6 271.2 360.6 282.6C351.5 294 343.6 309.9 330.9 315.9C318.1 321.8 299.2 316.9 284 318.3C268.8 319.6 251.4 327.4 239.7 323.8C228 320.2 223.5 305 213.6 296.9C203.8 288.7 185.3 284.7 180.5 274.7C175.7 264.7 180.2 248.5 184.8 236.8C189.4 225.1 200 215.7 208 204.6C216 193.4 221.1 176.8 232.8 170.1C244.6 163.4 263.3 165.9 278.4 164.2C293.4 162.4 311.1 155.8 323.1 159.4C335.1 163.1 341.7 177.2 350.3 185.9C358.8 194.7 368.6 201.4 374.4 211.7Z',
  'M367.4 203.3C371.5 210.5 376.6 220.1 375 228.4C373.3 236.7 364.1 244.9 357.8 252.9C351.4 260.9 345.9 272 337 276.2C328 280.4 314.8 277 304.1 277.9C293.5 278.8 281.3 284.3 273.1 281.8C264.9 279.3 261.8 268.6 254.9 262.9C248 257.2 235.1 254.4 231.7 247.4C228.4 240.4 231.5 229.1 234.7 220.9C237.9 212.7 245.4 206.1 251 198.3C256.6 190.5 260.1 178.9 268.4 174.2C276.6 169.5 289.7 171.3 300.2 170C310.8 168.8 323.2 164.2 331.5 166.7C339.9 169.2 344.6 179.2 350.5 185.3C356.5 191.4 363.4 196.1 367.4 203.3Z'
]

export function themeLogoColor(accent: unknown) {
  const id = normalizeTheme(accent)
  return (THEMES.find(item => item.id === id) || THEMES[0]).color
}

export function logoSvg(color: string, rounded = true, stroke = 18) {
  const rings = LOGO_RINGS.map(d => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linejoin="round"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rounded ? 104 : 0}" fill="${color}"/>${rings}</svg>`
}

export function logoDataUrl(color: string, rounded = true) {
  return `data:image/svg+xml,${encodeURIComponent(logoSvg(color, rounded))}`
}

export function MaiLogo({ size = 28, color, stroke }: { size?: number; color: string; stroke?: number }) {
  const width = stroke ?? (size <= 40 ? 24 : 18)
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false" style={{ display: 'block', flex: 'none' }}>
      <rect width="512" height="512" rx="104" fill={color} />
      {LOGO_RINGS.map((d, index) => <path key={index} d={d} fill="none" stroke="#fff" strokeWidth={width} strokeLinejoin="round" />)}
    </svg>
  )
}
