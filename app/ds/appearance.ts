'use client'

import { LUCIDE_ICONS } from './lucide'
import { COLOR_STYLES, setPaletteStyle, type ColorStyle } from '../../lib/v2/palette'

/**
 * Aparência personalizável (docs/PADROES.md, "Aparência"): pacote de ícones, grossura, cantos, fonte e cor de destaque.
 * Fica em `state.configs.appearance`; `applyAppearance` joga o valor no app inteiro (variáveis CSS + este mesmo estado, que o `Icon` lê).
 */
export type IconPack = 'lucide' | 'tabler' | 'phosphor-thin' | 'phosphor' | 'phosphor-bold' | 'phosphor-duotone' | 'outlined' | 'sharp' | 'rounded'
  | 'ios' | 'ios-filled' | 'ios-sharp' | 'remix' | 'remix-fill' | 'bootstrap' | 'bootstrap-fill' | 'heroicons' | 'heroicons-solid' | 'fontawesome' | 'material-classic' | 'material-classic-outline'
export type Shape = 'round' | 'square'
export const SHAPE_AREAS: { id: 'tasks' | 'habits' | 'projects'; label: string; hint: string }[] = [
  { id: 'tasks', label: 'Tarefas', hint: 'Marcador de concluir' },
  { id: 'habits', label: 'Hábitos', hint: 'Marcador de cada dia' },
  { id: 'projects', label: 'Projetos', hint: 'Foto e ícone do projeto' },
]
export type Shapes = Record<'tasks' | 'habits' | 'projects', Shape>
export type Appearance = { iconPack: IconPack; weight: number; iconScale: number; corners: 'round' | 'square'; font: string; accent: string; palette: string; colorStyle: ColorStyle; shapes: Shapes; layout: LayoutId; rail: boolean }

/** Posição do menu no desktop (no celular a barra de baixo manda). */
export const LAYOUTS = [
  { id: 'left', label: 'Lateral esquerda', hint: 'Padrão' },
  { id: 'right', label: 'Lateral direita', hint: 'Menu à direita' },
  { id: 'compact', label: 'Lateral compacta', hint: 'Só ícones' },
  { id: 'top', label: 'Menu superior', hint: 'Abas no topo' },
  { id: 'bottom', label: 'Menu inferior', hint: 'Barra de abas embaixo' },
  { id: 'dock', label: 'Dock flutuante', hint: 'Pílula embaixo' },
] as const
export type LayoutId = (typeof LAYOUTS)[number]['id']

export const DEFAULT_APPEARANCE: Appearance = { iconPack: 'lucide', weight: 1.5, iconScale: 1, corners: 'square', font: 'system', accent: '', palette: 'padrao', colorStyle: 'padrao', shapes: { tasks: 'round', habits: 'round', projects: 'round' }, layout: 'left', rail: false }

export const ICON_PACKS: { id: IconPack; label: string; hint: string; family: string }[] = [
  { id: 'lucide', label: 'Linhas', hint: 'Lucide: traço contínuo, leve', family: 'Linhas' },
  { id: 'tabler', label: 'Tabler', hint: 'Traço técnico, muitos desenhos', family: 'Linhas' },
  { id: 'remix', label: 'Remix linha', hint: 'Contorno firme e limpo', family: 'Linhas' },
  { id: 'bootstrap', label: 'Bootstrap', hint: 'Contorno fino, geométrico', family: 'Linhas' },
  { id: 'heroicons', label: 'Heroicons', hint: 'Contorno do Tailwind', family: 'Linhas' },
  { id: 'ios', label: 'iOS contorno', hint: 'Estilo Apple (Ionicons)', family: 'Apple / iOS' },
  { id: 'ios-filled', label: 'iOS cheio', hint: 'Estilo Apple, preenchido', family: 'Apple / iOS' },
  { id: 'ios-sharp', label: 'iOS reto', hint: 'Estilo Apple, cantos vivos', family: 'Apple / iOS' },
  { id: 'outlined', label: 'Material contorno', hint: 'Material Symbols, contorno', family: 'Material' },
  { id: 'sharp', label: 'Material reto', hint: 'Material Symbols, cantos vivos', family: 'Material' },
  { id: 'rounded', label: 'Material suave', hint: 'Material Symbols, cantos redondos', family: 'Material' },
  { id: 'material-classic', label: 'Material cheio', hint: 'Material clássico, preenchido', family: 'Material' },
  { id: 'material-classic-outline', label: 'Material linha', hint: 'Material clássico, contorno', family: 'Material' },
  { id: 'phosphor-thin', label: 'Phosphor fino', hint: 'Contorno finíssimo', family: 'Phosphor' },
  { id: 'phosphor', label: 'Phosphor', hint: 'Contorno regular', family: 'Phosphor' },
  { id: 'phosphor-bold', label: 'Phosphor forte', hint: 'Contorno grosso', family: 'Phosphor' },
  { id: 'phosphor-duotone', label: 'Phosphor duplo', hint: 'Duas camadas de tom', family: 'Phosphor' },
  { id: 'remix-fill', label: 'Remix cheio', hint: 'Sólido e marcado', family: 'Cheios' },
  { id: 'bootstrap-fill', label: 'Bootstrap cheio', hint: 'Sólido, geométrico', family: 'Cheios' },
  { id: 'heroicons-solid', label: 'Heroicons cheio', hint: 'Sólido do Tailwind', family: 'Cheios' },
  { id: 'fontawesome', label: 'Font Awesome', hint: 'Glifos sólidos, pesados', family: 'Cheios' },
]
/** Pacotes de traço fixo: a grossura não se aplica a eles. */
export const hasStrokeWeight = (pack: IconPack) => pack === 'lucide' || pack === 'tabler' || pack === 'outlined' || pack === 'sharp' || pack === 'rounded'

/* Paletas: trocam fundo, superfícies, linhas e texto (claro e escuro). A cor de destaque continua separada. As cores vivem em app/ds/palettes.css. */
export const PALETTES: { id: string; label: string; swatch: [string, string, string, string] }[] = [
  { id: 'padrao', label: 'Padrão', swatch: ['#FFFFFF', '#F7F8FA', '#EDEDED', '#1E1E1E'] },
  { id: 'grafite', label: 'Grafite', swatch: ['#FFFFFF', '#F3F4F6', '#E3E5E9', '#14171C'] },
  { id: 'floresta', label: 'Floresta', swatch: ['#FBFCF9', '#F1F5EE', '#E1E8DC', '#131A14'] },
  { id: 'oceano', label: 'Oceano', swatch: ['#FAFCFE', '#EFF5FA', '#DDE8F0', '#0F1820'] },
  { id: 'areia', label: 'Areia', swatch: ['#FFFDF9', '#F8F3EA', '#EBE3D4', '#1A1613'] },
  { id: 'lavanda', label: 'Lavanda', swatch: ['#FCFBFF', '#F4F1FB', '#E6E1F2', '#17141F'] },
  { id: 'meia-noite', label: 'Meia-noite', swatch: ['#FFFFFF', '#F3F4F6', '#E3E5E9', '#000000'] },
  { id: 'cereja', label: 'Cereja', swatch: ['#FDFCFC', '#F8F1F3', '#EFE1E5', '#1B0E11'] },
  { id: 'menta', label: 'Menta', swatch: ['#FCFDFD', '#F2F8F6', '#E2EEEA', '#0F1A16'] },
  { id: 'ceu', label: 'Céu', swatch: ['#FCFDFD', '#F1F6F8', '#E1EAEF', '#0E161B'] },
  { id: 'ambar', label: 'Âmbar', swatch: ['#FDFDFC', '#F9F6F1', '#F0EAE0', '#1C160D'] },
  { id: 'ardosia', label: 'Ardósia', swatch: ['#FCFCFD', '#F3F5F6', '#E5E8EB', '#121417'] },
  { id: 'terra', label: 'Terra', swatch: ['#FDFCFC', '#F8F4F2', '#EEE6E2', '#1A120F'] },
  { id: 'uva', label: 'Uva', swatch: ['#FDFCFD', '#F5F2F8', '#E9E2EE', '#150F1A'] },
  { id: 'limao', label: 'Limão', swatch: ['#FDFDFC', '#F7F8F1', '#ECEFE1', '#181B0E'] },
  { id: 'petroleo', label: 'Petróleo', swatch: ['#FCFDFD', '#F1F7F8', '#E1EDEF', '#0E191B'] },
  { id: 'rosa', label: 'Rosa', swatch: ['#FDFCFD', '#F8F2F6', '#EEE2EA', '#1A0F16'] },
  { id: 'oliva', label: 'Oliva', swatch: ['#FCFDFC', '#F5F7F3', '#E8EDE4', '#141810'] },
]

const SYSTEM_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
export const FONTS: { id: string; label: string; family?: string; google?: string }[] = [
  { id: 'system', label: 'Padrão do sistema' },
  { id: 'inter', label: 'Inter', family: 'Inter', google: 'Inter:wght@400;500;600;700' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope', google: 'Manrope:wght@400;500;600;700' },
  { id: 'dmsans', label: 'DM Sans', family: 'DM Sans', google: 'DM+Sans:wght@400;500;600;700' },
  { id: 'plex', label: 'IBM Plex Sans', family: 'IBM Plex Sans', google: 'IBM+Plex+Sans:wght@400;500;600;700' },
  { id: 'grotesk', label: 'Space Grotesk', family: 'Space Grotesk', google: 'Space+Grotesk:wght@400;500;600;700' },
  { id: 'worksans', label: 'Work Sans', family: 'Work Sans', google: 'Work+Sans:wght@400;500;600;700' },
  { id: 'serif', label: 'Source Serif', family: 'Source Serif 4', google: 'Source+Serif+4:wght@400;500;600;700' },
  { id: 'mono', label: 'JetBrains Mono', family: 'JetBrains Mono', google: 'JetBrains+Mono:wght@400;500;600;700' },
]

export function normalizeAppearance(raw: unknown): Appearance {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Appearance>
  const pack = ICON_PACKS.some(item => item.id === value.iconPack) ? (value.iconPack as IconPack) : DEFAULT_APPEARANCE.iconPack
  const weight = Math.min(2.5, Math.max(1, Number(value.weight) || DEFAULT_APPEARANCE.weight))
  return {
    iconPack: pack,
    weight,
    iconScale: Math.min(1.4, Math.max(0.8, Number(value.iconScale) || 1)),
    corners: value.corners === 'round' ? 'round' : 'square',
    font: FONTS.some(item => item.id === value.font) ? String(value.font) : 'system',
    accent: /^#[0-9a-f]{6}$/i.test(String(value.accent || '')) ? String(value.accent) : '',
    palette: PALETTES.some(item => item.id === value.palette) ? String(value.palette) : 'padrao',
    colorStyle: COLOR_STYLES.some(item => item.id === value.colorStyle) ? (value.colorStyle as ColorStyle) : 'padrao',
    shapes: Object.fromEntries(SHAPE_AREAS.map(area => [area.id, value.shapes?.[area.id] === 'square' ? 'square' : 'round'])) as Shapes,
    layout: LAYOUTS.some(item => item.id === value.layout) ? (value.layout as LayoutId) : 'left',
    rail: value.rail === true,
  }
}

/* Estado lido pelo Icon (useSyncExternalStore). */
let current: Appearance = DEFAULT_APPEARANCE
let snapshot: Appearance & { loaded: number } = { ...DEFAULT_APPEARANCE, loaded: 0 }
const listeners = new Set<() => void>()
const notify = () => { snapshot = { ...current, loaded: snapshot.loaded }; listeners.forEach(listener => listener()) }
export const getAppearance = () => snapshot

/* Pacotes externos carregam sob demanda, cada um em arquivo separado, só quando alguém escolhe. */
type IconModule = Record<string, unknown>
const external: Record<string, IconModule | undefined> = {}
const inflight: Record<string, Promise<void> | undefined> = {}
const LOADERS: Record<string, () => Promise<unknown>> = {
  tabler: () => import('@tabler/icons-react'),
  phosphor: () => import('@phosphor-icons/react'),
  io5: () => import('react-icons/io5'),
  ri: () => import('react-icons/ri'),
  bs: () => import('react-icons/bs'),
  hi2: () => import('react-icons/hi2'),
  fa6: () => import('react-icons/fa6'),
  md: () => import('react-icons/md'),
}
/* Famílias do react-icons: qual arquivo e como reconhecer, pelo nome exportado, o desenho "base" de cada variante. */
type Family = { module: string; match: (key: string) => string | undefined }
const take = (regex: RegExp) => (key: string) => regex.exec(key)?.[1]
const FAMILIES: Partial<Record<IconPack, Family>> = {
  ios: { module: 'io5', match: take(/^Io(.+)Outline$/) },
  'ios-filled': { module: 'io5', match: key => (/(Outline|Sharp)$/.test(key) ? undefined : take(/^Io(.+)$/)(key)) },
  'ios-sharp': { module: 'io5', match: take(/^Io(.+)Sharp$/) },
  remix: { module: 'ri', match: take(/^Ri(.+)Line$/) },
  'remix-fill': { module: 'ri', match: take(/^Ri(.+)Fill$/) },
  bootstrap: { module: 'bs', match: key => (/Fill$/.test(key) ? undefined : take(/^Bs(.+)$/)(key)) },
  'bootstrap-fill': { module: 'bs', match: take(/^Bs(.+)Fill$/) },
  heroicons: { module: 'hi2', match: take(/^HiOutline(.+)$/) },
  'heroicons-solid': { module: 'hi2', match: key => (/^Hi(Outline|Mini)/.test(key) ? undefined : take(/^Hi(.+)$/)(key)) },
  fontawesome: { module: 'fa6', match: key => (/^FaReg/.test(key) ? undefined : take(/^Fa(.+)$/)(key)) },
  'material-classic': { module: 'md', match: key => (/^Md(Outline|Sharp|Round|TwoTone)/.test(key) ? undefined : take(/^Md(.+)$/)(key)) },
  'material-classic-outline': { module: 'md', match: take(/^MdOutline(.+)$/) },
}
const moduleKey = (pack: IconPack) => (pack === 'tabler' ? 'tabler' : pack.startsWith('phosphor') ? 'phosphor' : FAMILIES[pack]?.module || '')
export function loadIconPack(pack: IconPack) {
  const key = moduleKey(pack)
  if (!key || external[key]) return Promise.resolve()
  inflight[key] ??= LOADERS[key]()
    .then(module => { external[key] = module as unknown as IconModule; snapshot = { ...current, loaded: snapshot.loaded + 1 }; listeners.forEach(listener => listener()) })
    .catch(() => { inflight[key] = undefined })
  return inflight[key] as Promise<void>
}

/* Nome do desenho em cada pacote, partindo do nome do Lucide. O que não estiver aqui tenta o mesmo nome; sem achar, usa Lucide. */
const TABLER: Record<string, string> = { Trash2: 'Trash', Building2: 'Building', Gamepad2: 'DeviceGamepad2', Utensils: 'ToolsKitchen2', PawPrint: 'Paw', Wrench: 'Tool', Globe: 'World', Smile: 'MoodSmile', Baby: 'BabyCarriage', Store: 'BuildingStore', Laptop: 'DeviceLaptop', Smartphone: 'DeviceMobile', Clapperboard: 'Movie', Mic: 'Microphone', HeartPulse: 'HeartRateMonitor', Flower2: 'Plant', FlaskConical: 'Flask', Zap: 'Bolt', Gem: 'Diamond', Languages: 'Language', Landmark: 'BuildingBank', CircleUser: 'UserCircle', Network: 'Hierarchy', RefreshCw: 'Refresh', DeleteIcon: 'Backspace', CalendarDays: 'CalendarMonth', ListChecks: 'Checklist', CalendarRange: 'CalendarWeek', FolderInput: 'FolderShare', PenLine: 'Pencil', Pencil: 'Pencil', CircleAlert: 'AlertCircle', CalendarClock: 'CalendarTime', ListFilter: 'Filter', Dumbbell: 'Barbell', Menu: 'Menu2', ImageIcon: 'Photo', Image: 'Photo', Info: 'InfoCircle', House: 'Home', BookOpen: 'Book', Ellipsis: 'Dots', Maximize2: 'Maximize', CirclePause: 'PlayerPause', Banknote: 'Cash', Percent: 'Percentage', Pause: 'PlayerPause', CirclePlay: 'PlayerPlay', Sprout: 'Plant2', StickyNote: 'Note', CircleCheckBig: 'CircleCheck', SlidersHorizontal: 'AdjustmentsHorizontal', Undo2: 'ArrowBackUp', Rows3: 'LayoutRows', Kanban: 'LayoutKanban', TriangleAlert: 'AlertTriangle', Link2: 'Link', Search: 'Search', Columns2: 'Columns2', Clipboard: 'Clipboard' }
const PHOSPHOR: Record<string, string> = { CalendarDays: 'CalendarDots', CalendarClock: 'CalendarDots', CalendarRange: 'CalendarDots', SquareCheck: 'CheckSquare', CircleCheck: 'CheckCircle', CircleCheckBig: 'CheckCircle', Trash2: 'Trash', ChevronRight: 'CaretRight', ChevronLeft: 'CaretLeft', ChevronUp: 'CaretUp', ChevronDown: 'CaretDown', CloudUpload: 'CloudArrowUp', GripVertical: 'DotsSixVertical', Pencil: 'PencilSimple', PenLine: 'PencilLine', Inbox: 'Tray', CircleAlert: 'WarningCircle', TriangleAlert: 'Warning', ListFilter: 'Funnel', LayoutGrid: 'SquaresFour', Menu: 'List', Ellipsis: 'DotsThree', Maximize2: 'ArrowsOut', ExternalLink: 'ArrowSquareOut', CirclePause: 'PauseCircle', CirclePlay: 'PlayCircle', TrendingUp: 'TrendUp', TrendingDown: 'TrendDown', CircleMinus: 'MinusCircle', Search: 'MagnifyingGlass', Sprout: 'Plant', Settings: 'Gear', Columns2: 'Columns', StickyNote: 'Note', Undo2: 'ArrowCounterClockwise', Rows3: 'Rows', Bold: 'TextB', Italic: 'TextItalic', Link2: 'Link', FileSpreadsheet: 'FileXls', Ban: 'Prohibit', RefreshCw: 'ArrowsClockwise', DeleteIcon: 'Backspace', Landmark: 'Bank', CircleUser: 'UserCircle', Network: 'TreeStructure', Music: 'MusicNotes', Plane: 'Airplane', Gamepad2: 'GameController', Utensils: 'ForkKnife', Map: 'MapTrifold', Bike: 'Bicycle', Building2: 'Buildings', Store: 'Storefront', Smartphone: 'DeviceMobile', Wifi: 'WifiHigh', Mail: 'Envelope', Shirt: 'TShirt', Clapperboard: 'FilmSlate', Mic: 'Microphone', HeartPulse: 'Heartbeat', Flower2: 'Flower', FlaskConical: 'Flask', Zap: 'Lightning', Languages: 'Translate', FolderInput: 'FolderSimple', Percent: 'Percent', Banknote: 'Money', Hourglass: 'Hourglass', ImageIcon: 'Image', CornerDownRight: 'ArrowElbowDownRight', ArrowLeftRight: 'ArrowsLeftRight', SlidersHorizontal: 'SlidersHorizontal', Droplet: 'Drop', House: 'House', Activity: 'Pulse', Dumbbell: 'Barbell', Layout: 'Layout', SquareDashed: 'SelectionAll', Hash: 'Hash', PiggyBank: 'PiggyBank', Tag: 'Tag', Gem: 'Diamond', Wrench: 'Wrench', PawPrint: 'PawPrint', Baby: 'Baby', Globe: 'Globe', Smile: 'Smiley', Scale: 'Scales', Clock: 'Clock', Ruler: 'Ruler', Briefcase: 'Briefcase' }

export type ExternalIcon = { component: unknown; kind: 'tabler' | 'phosphor' | 'react-icons' }
/* Sinônimos: o mesmo conceito tem nomes diferentes em cada família (engrenagem = gear/cog/settings). Chaves e valores em minúsculas, sem separador. */
const SYNONYMS: Record<string, string[]> = {
  settings: ['gear', 'cog', 'settings', 'setting', 'adjustments'], search: ['search', 'magnifyingglass', 'magnify'], trash: ['trash', 'delete', 'bin', 'dustbin'], trash2: ['trash', 'delete', 'bin'],
  pencil: ['pencil', 'edit', 'create', 'pen'], penline: ['pencil', 'edit', 'pen'], check: ['check', 'checkmark', 'done', 'tick'], x: ['close', 'x', 'xmark', 'cross', 'times'], plus: ['add', 'plus'], minus: ['minus', 'remove', 'subtract'],
  calendardays: ['calendar', 'calendarmonth', 'calendardays', 'event'], calendarclock: ['calendar', 'calendartime', 'event'], calendar: ['calendar', 'event'], clock: ['clock', 'time', 'watch'],
  house: ['home', 'house'], user: ['user', 'person', 'account'], circleuser: ['usercircle', 'person', 'account', 'circleuser'], users: ['users', 'people', 'group', 'usergroup'], bell: ['bell', 'notifications', 'notification', 'alarm'],
  tag: ['tag', 'label', 'pricetag'], wallet: ['wallet', 'wallet2', 'accountbalancewallet'], creditcard: ['creditcard', 'card'], menu: ['menu', 'bars', 'list', 'burger'], ellipsis: ['ellipsis', 'more', 'dots', 'threedots', 'moreHoriz'],
  chevronright: ['chevronright', 'arrowright', 'caretright', 'angleright', 'right'], chevronleft: ['chevronleft', 'arrowleft', 'caretleft', 'angleleft', 'left'], chevronup: ['chevronup', 'caretup', 'angleup', 'up'], chevrondown: ['chevrondown', 'caretdown', 'angledown', 'down'],
  circlecheck: ['checkmarkcircle', 'checkcircle', 'circlecheck', 'taskalt', 'circlecheckfill'], circlecheckbig: ['checkmarkcircle', 'checkcircle', 'circlecheck'], squarecheck: ['checkbox', 'checksquare', 'squarecheck', 'checkboxmarked'], listchecks: ['checklist', 'listcheck', 'listchecks', 'tasklist'],
  repeat: ['repeat', 'loop', 'sync', 'autorenew', 'refresh', 'arrowrepeat'], refreshcw: ['refresh', 'sync', 'reload', 'arrowclockwise'], flag: ['flag'], folder: ['folder', 'folder2'], file: ['file', 'document'], filetext: ['document', 'filetext', 'file', 'text'],
  stickynote: ['note', 'stickynote', 'document', 'filetext'], notebook: ['book', 'notebook', 'journal'], bookopen: ['book', 'bookopen', 'openbook', 'menubook'], image: ['image', 'photo', 'picture', 'images'], imageicon: ['image', 'photo', 'picture'],
  star: ['star'], heart: ['heart', 'favorite'], lock: ['lock', 'locked'], eye: ['eye', 'visibility'], eyeoff: ['eyeoff', 'eyeslash', 'visibilityoff', 'eyeinvisible'], link: ['link', 'link2'], link2: ['link', 'link2'], paperclip: ['attach', 'paperclip', 'attachment', 'attachfile'],
  download: ['download', 'cloudarrowdown', 'arrowdowntray'], upload: ['upload', 'cloudarrowup', 'arrowuptray'], cloudupload: ['cloudupload', 'cloudarrowup', 'upload'], share2: ['share', 'sharesocial', 'shareandroid'], filter: ['filter', 'funnel'], listfilter: ['filter', 'funnel', 'filterlist'],
  arrowupdown: ['swapvert', 'arrowdownup', 'arrowsvertical', 'sort'], arrowleftright: ['swaphoriz', 'arrowleftright', 'arrowsalt', 'swap'], copy: ['copy', 'documentduplicate', 'files'], save: ['save', 'floppy', 'disc'], info: ['information', 'info', 'infocircle'],
  circlealert: ['alertcircle', 'warningcircle', 'exclamationcircle', 'erroroutline'], trianglealert: ['warning', 'alert', 'exclamationtriangle', 'alerttriangle'], logout: ['logout', 'logoutbox', 'boxarrowright', 'exit'], layoutgrid: ['grid', 'squares', 'apps', 'dashboard', 'gridview'],
  sun: ['sun', 'sunny', 'lightmode'], moon: ['moon', 'darkmode', 'moonstars'], zap: ['flash', 'bolt', 'zap', 'lightning'], target: ['target', 'bullseye', 'adsclick'], rocket: ['rocket', 'rocketlaunch'], trophy: ['trophy', 'award', 'emojievents'],
  piggybank: ['piggybank', 'savings', 'cash'], banknote: ['cash', 'money', 'banknote', 'cashstack'], landmark: ['bank', 'landmark', 'accountbalance', 'building'], dumbbell: ['barbell', 'dumbbell', 'fitnesscenter', 'gym'], utensils: ['restaurant', 'fastfood', 'utensils', 'cutlery', 'silverware', 'forkknife'],
  car: ['car', 'directionscar', 'caralt'], plane: ['airplane', 'plane', 'flight', 'planedeparture'], bike: ['bicycle', 'bike', 'pedalbike'], pawprint: ['paw', 'pawprint', 'pets'], graduationcap: ['school', 'graduationcap', 'mortarboard', 'schoolhat'], briefcase: ['briefcase', 'work', 'case'],
  lightbulb: ['bulb', 'lightbulb', 'lightbulbfill'], brain: ['brain', 'psychology'], flaskconical: ['flask', 'science', 'beaker'], music: ['musical', 'music', 'musicnote', 'musicnotes'], film: ['film', 'movie', 'filmslate'], clapperboard: ['film', 'movie', 'clapperboard', 'filmslate'],
  smartphone: ['phone', 'smartphone', 'phoneportrait', 'devicemobile'], laptop: ['laptop', 'computer', 'laptopoutline'], wifi: ['wifi'], mail: ['mail', 'envelope', 'email'], phone: ['call', 'phone', 'telephone'], mic: ['mic', 'microphone'], map: ['map'], globe: ['globe', 'public', 'world', 'earth'],
  sprout: ['leaf', 'seedling', 'sprout', 'eco', 'plant'], flower2: ['flower', 'flowerlotus', 'flower2'], leaf: ['leaf', 'eco'], gem: ['diamond', 'gem', 'diamondfill'], anchor: ['anchor'], bookmark: ['bookmark'], coffee: ['cafe', 'coffee', 'mugHot', 'cup'],
  palette: ['colorpalette', 'palette', 'paint'], brush: ['brush', 'paintbrush', 'paintbrushfill'], code: ['code', 'codeslash', 'terminal'], hash: ['hash', 'number'], percent: ['percent', 'percentage', 'percentagecircle'], undo2: ['arrowundo', 'undo', 'arrowcounterclockwise', 'arrowuturnleft'],
  sticky: ['note'], inbox: ['inbox', 'tray', 'mailbox'], store: ['storefront', 'store', 'shop', 'building'], shoppingcart: ['cart', 'shoppingcart', 'basket'], gift: ['gift', 'giftcard', 'present'], scale: ['scale', 'balance', 'scales'], hourglass: ['hourglass', 'hourglassSplit', 'timer'],
  activity: ['pulse', 'activity', 'heartpulse', 'monitorheart'], heartpulse: ['heartpulse', 'pulse', 'heartbeat', 'monitorheart', 'healthandsafety'], baby: ['baby', 'childcare'], smile: ['happy', 'smile', 'emoji', 'mood', 'faceSmile'],
  wrench: ['build', 'wrench', 'tools', 'hammer'], scissors: ['cut', 'scissors', 'contentcut'], shirt: ['shirt', 'tshirt', 'checkroom'], droplet: ['water', 'droplet', 'drop', 'opacity'], pause: ['pause'], play: ['play'], circleplay: ['playcircle', 'circleplay'], circlepause: ['pausecircle', 'circlepause'],
  list: ['list', 'listul', 'listbullet'], rows3: ['rows', 'viewagenda', 'listrows', 'bars'], columns2: ['columns', 'viewcolumn', 'layoutsplit'], kanban: ['kanban', 'viewkanban', 'columns', 'layoutthreecolumns'], slidershorizontal: ['sliders', 'options', 'tune', 'adjustments'], network: ['network', 'hierarchy', 'sitemap', 'accounttree'],
  maximize2: ['expand', 'maximize', 'arrowsfullscreen', 'arrowsout', 'openinfull'], externallink: ['openinnew', 'externallink', 'boxarrowupright', 'arrowtoprightonsquare'], gripvertical: ['drag', 'gripvertical', 'dragindicator', 'draghandle'], ban: ['ban', 'block', 'prohibit'],
  bold: ['bold', 'formatbold', 'typebold', 'textb'], italic: ['italic', 'formatitalic', 'typeitalic', 'textitalic'], building2: ['business', 'building', 'buildings', 'apartment'], mappin: ['location', 'pin', 'mappin', 'place'], timer: ['timer', 'stopwatch'],
}
const tokensOf = (name: string) => name.replace(/(\d+)$/, '').split(/(?=[A-Z])/).map(item => item.toLowerCase()).filter(Boolean)
const indexes: Record<string, Map<string, string> | undefined> = {}
const resolved = new Map<string, unknown>()
function indexOfPack(pack: IconPack, mod: IconModule) {
  const family = FAMILIES[pack]!
  const cached = indexes[pack]
  if (cached) return cached
  const map = new Map<string, string>()
  for (const key of Object.keys(mod)) {
    const stem = family.match(key)
    if (stem) map.set(stem.toLowerCase().replace(/[^a-z0-9]/g, ''), key)
  }
  return (indexes[pack] = map)
}
function resolveFamily(pack: IconPack, base: string, mod: IconModule) {
  const map = indexOfPack(pack, mod)
  const joined = base.toLowerCase()
  const tokens = tokensOf(base)
  const noDigits = joined.replace(/\d+$/, '')
  const candidates = [joined, noDigits, ...(SYNONYMS[joined] || SYNONYMS[noDigits] || []).map(item => item.toLowerCase()), ...tokens.slice(0, 1), tokens.slice(0, 2).join(''), tokens[tokens.length - 1]]
  for (const candidate of candidates) {
    const hit = map.get(candidate)
    if (hit) return mod[hit]
  }
  // Aproximação: prefixo comum longo entre o nome procurado e o desenho (só quando não há outra saída).
  let best: string | undefined
  let bestScore = 0
  for (const [stem, key] of map) {
    for (const candidate of candidates) {
      if (candidate.length < 4 || stem.length < 4) continue
      const score = stem.startsWith(candidate) || candidate.startsWith(stem) ? Math.min(stem.length, candidate.length) - Math.abs(stem.length - candidate.length) * 0.25 : 0
      if (score > bestScore) { bestScore = score; best = key }
    }
  }
  return best && bestScore >= 4 ? mod[best] : undefined
}

/** Componente do pacote externo para um nome de ícone do app, ou nada (aí o Icon usa Lucide). */
export function externalIcon(pack: IconPack, name: string): ExternalIcon | undefined {
  const base = (LUCIDE_ICONS[name] as unknown as { displayName?: string } | undefined)?.displayName
  if (!base) return undefined
  if (pack === 'tabler' && external.tabler) {
    const candidate = external.tabler[`Icon${TABLER[base] || base}`] ?? external.tabler[`Icon${base.replace(/\d+$/, '')}`]
    return candidate ? { component: candidate, kind: 'tabler' } : undefined
  }
  if (pack.startsWith('phosphor') && external.phosphor) {
    const candidate = external.phosphor[PHOSPHOR[base] || base] ?? external.phosphor[base.replace(/\d+$/, '')]
    return candidate ? { component: candidate, kind: 'phosphor' } : undefined
  }
  const family = FAMILIES[pack]
  const mod = family ? external[family.module] : undefined
  if (family && mod) {
    const cacheKey = `${pack}:${base}`
    if (!resolved.has(cacheKey)) resolved.set(cacheKey, resolveFamily(pack, base, mod))
    const component = resolved.get(cacheKey)
    return component ? { component, kind: 'react-icons' } : undefined
  }
  return undefined
}
export const phosphorWeight = (pack: IconPack) => (pack === 'phosphor-thin' ? 'thin' : pack === 'phosphor-bold' ? 'bold' : pack === 'phosphor-duotone' ? 'duotone' : 'regular')
export const subscribeAppearance = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** Peso do traço (1–2,5) vira a espessura da fonte Material (200–500). */
export const materialWeight = (weight: number) => Math.round(Math.min(500, Math.max(200, 100 + weight * 133)) / 50) * 50
export const MATERIAL_FAMILY: Record<'outlined' | 'sharp' | 'rounded', string> = { outlined: 'Material Symbols Outlined', sharp: 'Material Symbols Sharp', rounded: 'Material Symbols Rounded' }

function loadFont(id: string, href: string) {
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function applyAppearance(raw: unknown) {
  const next = normalizeAppearance(raw)
  const root = document.documentElement
  const changed = JSON.stringify(next) !== JSON.stringify(current)
  current = next
  void loadIconPack(next.iconPack)
  if (next.iconPack === 'outlined' || next.iconPack === 'sharp' || next.iconPack === 'rounded') {
    const name = next.iconPack === 'sharp' ? 'Material+Symbols+Sharp' : 'Material+Symbols+Rounded'
    if (next.iconPack !== 'outlined') loadFont(`mai-icons-${next.iconPack}`, `https://fonts.googleapis.com/css2?family=${name}:opsz,wght,FILL,GRAD@20..24,200..500,0..1,0&display=swap`)
  }
  setPaletteStyle(next.colorStyle)
  for (const area of SHAPE_AREAS) {
    if (next.shapes[area.id] === 'square') root.style.setProperty(`--ds-shape-${area.id}`, '4px')
    else root.style.removeProperty(`--ds-shape-${area.id}`)
  }
  // Barra fechada (só ícones) vale para as laterais esquerda/direita; vira o trilho compacto.
  const effective = next.rail && (next.layout === 'left' || next.layout === 'right') ? 'compact' : next.layout
  if (effective === 'left') delete root.dataset.maiLayout
  else root.dataset.maiLayout = effective
  if (next.layout === 'right' && effective === 'compact') root.dataset.maiSide = 'right'
  else delete root.dataset.maiSide
  if (next.palette === 'padrao') delete root.dataset.maiPalette
  else root.dataset.maiPalette = next.palette
  const font = FONTS.find(item => item.id === next.font)
  if (font?.family && font.google) {
    loadFont(`mai-font-${font.id}`, `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`)
    root.style.setProperty('--ds-font', `'${font.family}', ${SYSTEM_STACK}`)
    root.dataset.maiFont = font.id
  } else {
    root.style.removeProperty('--ds-font')
    delete root.dataset.maiFont
  }
  if (next.accent) {
    root.style.setProperty('--ds-accent', next.accent)
    root.style.setProperty('--ds-accent-strong', `color-mix(in srgb, ${next.accent} 80%, black)`)
    root.style.setProperty('--ds-accent-soft', `color-mix(in srgb, ${next.accent} 16%, transparent)`)
    root.style.setProperty('--ds-on-accent', luminance(next.accent) > 0.6 ? '#111111' : '#FFFFFF')
  } else {
    for (const key of ['--ds-accent', '--ds-accent-strong', '--ds-accent-soft', '--ds-on-accent']) root.style.removeProperty(key)
  }
  if (changed) notify()
}
