import { DEFAULT_STYLE, StyleSettings, BarcodeType } from "./barcode_core"
export const HISTORY_KEY = "recent_history"
export const HISTORY_MAX = 20
export const FAVORITES_KEY = "favorites"
export const FOLDERS_KEY = "favorite_folders"
export const SETTINGS_KEY = "style_settings"
// Keep live data outside the script package. iCloud Documents survives script
// builds and is visible in the Files app; App Group is the offline fallback.
const EXTERNAL_DATA_ROOT = FileManager.isiCloudEnabled
  ? `${FileManager.iCloudDocumentsDirectory}/BarcodeGenerator`
  : `${FileManager.appGroupDocumentsDirectory}/BarcodeGenerator`
const FAVORITES_FILES_ROOT = `${EXTERNAL_DATA_ROOT}/favorites`
const FAVORITES_INDEX_FILE = `${FAVORITES_FILES_ROOT}/index.json`
const FOLDERS_FILE = `${EXTERNAL_DATA_ROOT}/folders.json`
const LEGACY_FAVORITES_ROOTS = [
  `${FileManager.documentsDirectory}/BarcodeGeneratorFavorites`,
  `${FileManager.scriptsDirectory}/BarcodeGeneratorFavorites`,
]
const OLD_FAVORITES_FILE = "barcode_generator_favorites.json"
const OLD_FOLDERS_FILE = "barcode_generator_favorite_folders.json"
export type HistoryItem = { id: string; texts: string[]; type: BarcodeType; time: number }
export type FavoriteItem = { id: string; name: string; texts: string[]; type: BarcodeType; time: number; folder: string }
export type InterchangeFavorite = { id?: string; name: string; rootFolder: string; subFolder: string; folder?: string; type: BarcodeType; barcodeType?: BarcodeType; time: number; texts: string[] }
export type InterchangeBackup = { format: "BarcodeGeneratorInterchange"; version: 1; exportedAt: number; folders: { name: string; children: string[] }[]; favorites: InterchangeFavorite[] }
const BARCODE_TYPES: BarcodeType[] = ["qr", "code128", "code39", "ean13", "ean8", "upca", "itf14", "codabar"]
function favoriteFilePath(favorite: FavoriteItem): string {
  const folder = favorite.folder ? `/${favorite.folder}` : ""
  return `${FAVORITES_FILES_ROOT}${folder}/${encodeURIComponent(favorite.id)}.json`
}
function normalizeFavorite(f: any): FavoriteItem | null {
  if (!f || typeof f !== "object" || typeof f.name !== "string" || !Array.isArray(f.texts) || !f.texts.every((text: any) => typeof text === "string")) return null
  return {
    ...f,
    id: typeof f.id === "string" && f.id.length > 0 ? f.id : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: f.name.trim(),
    type: BARCODE_TYPES.includes(f.type) ? f.type : "code128",
    time: typeof f.time === "number" && Number.isFinite(f.time) ? f.time : Date.now(),
    folder: typeof f.folder === "string" ? f.folder.split("/").map((part) => part.trim()).filter(Boolean).slice(0, 2).join("/") : "",
  }
}
function loadFavoritesFromFiles(root: string): FavoriteItem[] {
  if (!FileManager.existsSync(root)) return []
  const entries = FileManager.readDirectorySync(root, true)
  return entries.map((entry: string) => entry.startsWith("/") ? entry : `${root}/${entry}`)
    .filter((path: string) => path.endsWith(".json") && !path.endsWith("/index.json") && FileManager.isFileSync(path))
    .map((path: string) => { try { return normalizeFavorite(JSON.parse(FileManager.readAsStringSync(path))) } catch { return null } })
    .filter((favorite: FavoriteItem | null): favorite is FavoriteItem => favorite !== null)
}
function saveFavoritesToFiles(items: FavoriteItem[]) {
  FileManager.createDirectorySync(FAVORITES_FILES_ROOT, true)
  const expected = new Set<string>()
  for (const favorite of items) {
    const path = favoriteFilePath(favorite)
    expected.add(path)
    FileManager.createDirectorySync(path.slice(0, path.lastIndexOf("/")), true)
    FileManager.writeAsStringSync(path, JSON.stringify(favorite, null, 2))
  }
  const existing = FileManager.readDirectorySync(FAVORITES_FILES_ROOT, true)
    .map((entry: string) => entry.startsWith("/") ? entry : `${FAVORITES_FILES_ROOT}/${entry}`)
    .filter((path: string) => path.endsWith(".json") && FileManager.isFileSync(path))
  for (const path of existing) if (!expected.has(path)) FileManager.removeSync(path)
  FileManager.writeAsStringSync(FAVORITES_INDEX_FILE, JSON.stringify({ version: 1, ids: items.map((favorite) => favorite.id) }))
}
export function loadHistory(): HistoryItem[] { const saved = Storage.get<HistoryItem[]>(HISTORY_KEY); return Array.isArray(saved) ? saved.map((h) => ({ ...h, type: h.type ?? "code128" })) : [] }
export function saveHistory(items: HistoryItem[]) { Storage.set(HISTORY_KEY, items) }
export function loadFavorites(): FavoriteItem[] {
  // Storage is the authoritative live store. File-based data is only a
  // migration fallback; reading it on every launch can resurrect stale files
  // after Build Script has copied or reordered the script package.
  const shared = Storage.get<FavoriteItem[]>(FAVORITES_KEY, { shared: true })
  const local = Storage.get<FavoriteItem[]>(FAVORITES_KEY)
  const saved = Array.isArray(shared) ? shared : (Array.isArray(local) ? local : null)
  if (Array.isArray(saved)) {
    return saved.map(normalizeFavorite).filter((favorite: FavoriteItem | null): favorite is FavoriteItem => favorite !== null)
  }
  const hasExternalIndex = FileManager.existsSync(FAVORITES_INDEX_FILE)
  const currentFavorites = loadFavoritesFromFiles(FAVORITES_FILES_ROOT)
  if (hasExternalIndex) return currentFavorites
  const legacyFavorites = LEGACY_FAVORITES_ROOTS.flatMap(loadFavoritesFromFiles)
  const storedFavorites = Array.isArray(saved)
    ? saved.map(normalizeFavorite).filter((favorite: FavoriteItem | null): favorite is FavoriteItem => favorite !== null)
    : []
  const byId = new Map<string, FavoriteItem>()
  for (const favorite of [...currentFavorites, ...legacyFavorites, ...storedFavorites]) {
    if (!byId.has(favorite.id)) byId.set(favorite.id, favorite)
  }
  const allFavorites = Array.from(byId.values())
  if (allFavorites.length > 0 && (legacyFavorites.length > 0 || storedFavorites.length > 0)) {
    Storage.set(FAVORITES_KEY, allFavorites)
    Storage.set(FAVORITES_KEY, allFavorites, { shared: true })
  }
  return allFavorites
}
export function saveFavorites(items: FavoriteItem[]) {
  // Keep one JSON file per favorite outside the script package. Storage is a
  // mirror so older script versions can still read the data.
  try { saveFavoritesToFiles(items) } catch { /* Storage remains the fallback */ }
  Storage.set(FAVORITES_KEY, items)
  Storage.set(FAVORITES_KEY, items, { shared: true })
}
export function loadFolders(): string[] {
  if (FileManager.existsSync(FOLDERS_FILE)) {
    try {
      const external = JSON.parse(FileManager.readAsStringSync(FOLDERS_FILE))
      if (Array.isArray(external)) return external.filter((folder): folder is string => typeof folder === "string")
    } catch { /* fall back to Storage and favorite metadata */ }
  }
  const shared = Storage.get<string[]>(FOLDERS_KEY, { shared: true })
  const local = Storage.get<string[]>(FOLDERS_KEY)
  const saved = Array.isArray(shared) && shared.length > 0 ? shared : (Array.isArray(local) ? local : shared)
  const favoriteFolders = loadFavorites().map((f) => f.folder).filter((f) => f.trim().length > 0)
  const normalized = Array.isArray(saved) ? saved.filter((f) => typeof f === "string").flatMap((folder) => {
    const parts = folder.split("/").map((part) => part.trim()).filter(Boolean).slice(0, 2)
    return parts.length === 2 ? [parts[0], parts.join("/")] : parts
  }) : []
  return Array.from(new Set([...normalized, ...favoriteFolders])).filter((f) => f.trim().length > 0)
}
export function saveFolders(folders: string[]) {
  const normalized = Array.from(new Set(folders)).filter((f) => f.trim().length > 0)
  try {
    FileManager.createDirectorySync(EXTERNAL_DATA_ROOT, true)
    FileManager.writeAsStringSync(FOLDERS_FILE, JSON.stringify(normalized, null, 2))
  } catch { /* Storage remains the fallback */ }
  Storage.set(FOLDERS_KEY, normalized)
  Storage.set(FOLDERS_KEY, normalized, { shared: true })
}
export function splitFolder(folder: string): { rootFolder: string; subFolder: string } { const parts = folder.split("/").map((part) => part.trim()).filter(Boolean); return { rootFolder: parts[0] ?? "", subFolder: parts[1] ?? "" } }
export function joinFolder(rootFolder: string, subFolder: string): string { const root = rootFolder.trim(); const child = subFolder.trim(); if (!root) return ""; return child ? `${root}/${child}` : root }
export function createInterchangeBackup(favorites: FavoriteItem[], folders: string[]): InterchangeBackup {
  const folderPaths = Array.from(new Set([...folders, ...favorites.map((favorite) => favorite.folder)]))
    .map((folder) => folder.trim()).filter(Boolean)
  const rootNames = Array.from(new Set(folderPaths.map((folder) => splitFolder(folder).rootFolder)))
  return {
    format: "BarcodeGeneratorInterchange",
    version: 1,
    exportedAt: Date.now(),
    folders: rootNames.map((name) => ({
      name,
      children: Array.from(new Set(folderPaths
        .filter((folder) => splitFolder(folder).rootFolder === name)
        .map((folder) => splitFolder(folder).subFolder)
        .filter(Boolean))),
    })),
    favorites: favorites.map((favorite) => {
      const { rootFolder, subFolder } = splitFolder(favorite.folder)
      return { id: favorite.id, name: favorite.name, rootFolder, subFolder, folder: joinFolder(rootFolder, subFolder), type: favorite.type ?? "code128", barcodeType: favorite.type ?? "code128", time: favorite.time, texts: favorite.texts }
    }),
  }
}

export function parseInterchangeBackup(value: unknown): InterchangeBackup {
  if (!value || typeof value !== "object") throw new Error("备份文件不是有效的 JSON 对象")
  const envelope = value as any
  if (envelope.format !== "BarcodeGeneratorInterchange") throw new Error("不是 BarcodeGeneratorInterchange 备份文件")
  if (envelope.version !== 1) throw new Error(`不支持的备份版本：${String(envelope.version)}`)
  // Android exports v1 backups with the actual data serialized in `payload`.
  // Older scripting backups store folders/favorites directly in the root.
  let data = envelope
  if (typeof envelope.payload === "string") {
    try {
      data = JSON.parse(envelope.payload)
    } catch {
      throw new Error("备份中的 payload 不是有效的 JSON")
    }
    if (!data || typeof data !== "object") throw new Error("备份中的 payload 无效")
  }
  if (!Array.isArray(data.folders) || !Array.isArray(data.favorites)) throw new Error("备份缺少 folders 或 favorites")
  const folders = data.folders.map((root: any) => {
    // Android v1 uses a flat string array; the scripting format uses
    // { name, children } objects. Normalize both forms for the UI.
    if (typeof root === "string") {
      const pathParts = root.split("/").map((part: string) => part.trim()).filter(Boolean)
      if (pathParts.length === 0 || pathParts.length > 2) throw new Error("备份中存在无效的文件夹路径")
      return { name: pathParts[0], children: pathParts.length === 2 ? [pathParts[1]] : [] }
    }
    if (!root || typeof root.name !== "string" || !root.name.trim() || !Array.isArray(root.children)) throw new Error("备份中存在无效的文件夹结构")
    const children = root.children.map((child: any) => { if (typeof child !== "string" || child.includes("/")) throw new Error("备份中存在无效的二级文件夹"); return child.trim() }).filter(Boolean)
    return { name: root.name.trim(), children: Array.from(new Set(children)) }
  })
  const favorites = data.favorites.map((item: any) => {
    if (!item || typeof item.name !== "string" || !item.name.trim() || !Array.isArray(item.texts) || item.texts.some((text: any) => typeof text !== "string")) throw new Error("备份中存在无效的收藏")
    const rootFolder = typeof item.rootFolder === "string" ? item.rootFolder.trim() : ""
    const subFolder = typeof item.subFolder === "string" ? item.subFolder.trim() : ""
    const legacyFolder = typeof item.folder === "string" ? item.folder.trim() : ""
    const folderParts = legacyFolder.split("/").map((part: string) => part.trim()).filter(Boolean)
    const resolvedRoot = rootFolder || folderParts[0] || ""
    const resolvedSub = subFolder || folderParts[1] || ""
    if (resolvedRoot.includes("/") || resolvedSub.includes("/")) throw new Error("备份中存在无效的文件夹路径")
    const type = item.type ?? item.barcodeType ?? item.format ?? "code128"
    if (!BARCODE_TYPES.includes(type)) throw new Error(`不支持的条码格式：${String(type)}`)
    return { id: typeof item.id === "string" ? item.id : undefined, name: item.name.trim(), rootFolder: resolvedRoot, subFolder: resolvedSub, folder: joinFolder(resolvedRoot, resolvedSub), type, barcodeType: type, time: typeof item.time === "number" && Number.isFinite(item.time) ? item.time : Date.now(), texts: item.texts.slice() }
  })
  return { format: "BarcodeGeneratorInterchange", version: 1, exportedAt: typeof data.exportedAt === "number" ? data.exportedAt : Date.now(), folders, favorites }
}

export function interchangeFoldersToPaths(backup: InterchangeBackup): string[] {
  const paths = backup.folders.flatMap((root) => [root.name, ...root.children.map((child) => joinFolder(root.name, child))])
  const favoritePaths = backup.favorites.map((favorite) => joinFolder(favorite.rootFolder, favorite.subFolder))
  return Array.from(new Set([...paths, ...favoritePaths])).filter((path) => path.length > 0)
}
export function loadSettings(): StyleSettings { const saved = Storage.get<Partial<StyleSettings>>(SETTINGS_KEY); return { ...DEFAULT_STYLE, ...(saved && typeof saved === "object" ? saved : {}) } }
export function saveSettings(settings: StyleSettings) { Storage.set(SETTINGS_KEY, settings) }
function readOldICloudJSON<T>(fileName: string): T | null { if (!FileManager.isiCloudEnabled) return null; const path = `${FileManager.iCloudDocumentsDirectory}/${fileName}`; if (!FileManager.existsSync(path)) return null; try { return JSON.parse(FileManager.readAsStringSync(path)) as T } catch { return null } }
function migrateLegacyData() { const importedFavorites = Storage.get<FavoriteItem[]>("barcode_generator_legacy_favorites", { shared: true }); const importedHistory = Storage.get<HistoryItem[]>("barcode_generator_legacy_history", { shared: true }); if (!Storage.contains(FAVORITES_KEY) && Array.isArray(importedFavorites)) saveFavorites(importedFavorites); if (!Storage.contains(HISTORY_KEY) && Array.isArray(importedHistory)) saveHistory(importedHistory) }
function migrateFavoritesToSharedStorage() { if (!Array.isArray(Storage.get<FavoriteItem[]>(FAVORITES_KEY, { shared: true }))) { const oldFavorites = Storage.get<FavoriteItem[]>(FAVORITES_KEY) ?? readOldICloudJSON<FavoriteItem[]>(OLD_FAVORITES_FILE); if (Array.isArray(oldFavorites)) saveFavorites(oldFavorites) } if (!Array.isArray(Storage.get<string[]>(FOLDERS_KEY, { shared: true }))) { const oldFolders = Storage.get<string[]>(FOLDERS_KEY) ?? readOldICloudJSON<string[]>(OLD_FOLDERS_FILE); if (Array.isArray(oldFolders)) saveFolders(oldFolders) } }
migrateLegacyData()
migrateFavoritesToSharedStorage()
