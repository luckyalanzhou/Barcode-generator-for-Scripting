import { DEFAULT_STYLE, StyleSettings, BarcodeType } from "./barcode_core"
export const HISTORY_KEY = "recent_history"
export const HISTORY_MAX = 20
export const FAVORITES_KEY = "favorites"
export const FOLDERS_KEY = "favorite_folders"
export const SETTINGS_KEY = "style_settings"
const OLD_FAVORITES_FILE = "barcode_generator_favorites.json"
const OLD_FOLDERS_FILE = "barcode_generator_favorite_folders.json"
export type HistoryItem = { id: string; texts: string[]; type: BarcodeType; time: number }
export type FavoriteItem = { id: string; name: string; texts: string[]; type: BarcodeType; time: number; folder: string }
export type InterchangeFavorite = { id?: string; name: string; rootFolder: string; subFolder: string; type: BarcodeType; time: number; texts: string[] }
export type InterchangeBackup = { format: "BarcodeGeneratorInterchange"; version: 1; exportedAt: number; folders: { name: string; children: string[] }[]; favorites: InterchangeFavorite[] }
const BARCODE_TYPES: BarcodeType[] = ["qr", "code128", "code39", "ean13", "ean8", "upca", "itf14", "codabar"]
export function loadHistory(): HistoryItem[] { const saved = Storage.get<HistoryItem[]>(HISTORY_KEY); return Array.isArray(saved) ? saved.map((h) => ({ ...h, type: h.type ?? "code128" })) : [] }
export function saveHistory(items: HistoryItem[]) { Storage.set(HISTORY_KEY, items) }
export function loadFavorites(): FavoriteItem[] { const shared = Storage.get<FavoriteItem[]>(FAVORITES_KEY, { shared: true }); const saved = Array.isArray(shared) ? shared : Storage.get<FavoriteItem[]>(FAVORITES_KEY); if (!Array.isArray(saved)) return []; return saved.map((f) => ({ ...f, type: f.type ?? "code128", folder: typeof f.folder === "string" ? f.folder : "" })) }
export function saveFavorites(items: FavoriteItem[]) { Storage.set(FAVORITES_KEY, items, { shared: true }) }
export function loadFolders(): string[] { const shared = Storage.get<string[]>(FOLDERS_KEY, { shared: true }); const saved = Array.isArray(shared) ? shared : Storage.get<string[]>(FOLDERS_KEY); const favoriteFolders = loadFavorites().map((f) => f.folder).filter((f) => f.trim().length > 0); return Array.from(new Set([...(Array.isArray(saved) ? saved : []), ...favoriteFolders])).filter((f) => f.trim().length > 0) }
export function saveFolders(folders: string[]) { Storage.set(FOLDERS_KEY, Array.from(new Set(folders)).filter((f) => f.trim().length > 0), { shared: true }) }
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
      return { id: favorite.id, name: favorite.name, rootFolder, subFolder, type: favorite.type ?? "code128", time: favorite.time, texts: favorite.texts }
    }),
  }
}

export function parseInterchangeBackup(value: unknown): InterchangeBackup {
  if (!value || typeof value !== "object") throw new Error("备份文件不是有效的 JSON 对象")
  const data = value as any
  if (data.format !== "BarcodeGeneratorInterchange") throw new Error("不是 BarcodeGeneratorInterchange 备份文件")
  if (data.version !== 1) throw new Error(`不支持的备份版本：${String(data.version)}`)
  if (!Array.isArray(data.folders) || !Array.isArray(data.favorites)) throw new Error("备份缺少 folders 或 favorites")
  const folders = data.folders.map((root: any) => {
    if (!root || typeof root.name !== "string" || !root.name.trim() || !Array.isArray(root.children)) throw new Error("备份中存在无效的文件夹结构")
    const children = root.children.map((child: any) => { if (typeof child !== "string" || child.includes("/")) throw new Error("备份中存在无效的二级文件夹"); return child.trim() }).filter(Boolean)
    return { name: root.name.trim(), children: Array.from(new Set(children)) }
  })
  const favorites = data.favorites.map((item: any) => {
    if (!item || typeof item.name !== "string" || !item.name.trim() || !Array.isArray(item.texts) || item.texts.some((text: any) => typeof text !== "string")) throw new Error("备份中存在无效的收藏")
    const type = item.type ?? "code128"
    if (!BARCODE_TYPES.includes(type)) throw new Error(`不支持的条码格式：${String(type)}`)
    return { id: typeof item.id === "string" ? item.id : undefined, name: item.name.trim(), rootFolder: typeof item.rootFolder === "string" ? item.rootFolder.trim() : "", subFolder: typeof item.subFolder === "string" ? item.subFolder.trim() : "", type, time: typeof item.time === "number" && Number.isFinite(item.time) ? item.time : Date.now(), texts: item.texts.slice() }
  })
  return { format: "BarcodeGeneratorInterchange", version: 1, exportedAt: typeof data.exportedAt === "number" ? data.exportedAt : Date.now(), folders, favorites }
}

export function interchangeFoldersToPaths(backup: InterchangeBackup): string[] {
  return Array.from(new Set(backup.folders.flatMap((root) => [root.name, ...root.children.map((child) => joinFolder(root.name, child))])))
}
export function loadSettings(): StyleSettings { const saved = Storage.get<Partial<StyleSettings>>(SETTINGS_KEY); return { ...DEFAULT_STYLE, ...(saved && typeof saved === "object" ? saved : {}) } }
export function saveSettings(settings: StyleSettings) { Storage.set(SETTINGS_KEY, settings) }
function readOldICloudJSON<T>(fileName: string): T | null { if (!FileManager.isiCloudEnabled) return null; const path = `${FileManager.iCloudDocumentsDirectory}/${fileName}`; if (!FileManager.existsSync(path)) return null; try { return JSON.parse(FileManager.readAsStringSync(path)) as T } catch { return null } }
function migrateLegacyData() { const importedFavorites = Storage.get<FavoriteItem[]>("barcode_generator_legacy_favorites", { shared: true }); const importedHistory = Storage.get<HistoryItem[]>("barcode_generator_legacy_history", { shared: true }); if (!Storage.contains(FAVORITES_KEY) && Array.isArray(importedFavorites)) saveFavorites(importedFavorites); if (!Storage.contains(HISTORY_KEY) && Array.isArray(importedHistory)) saveHistory(importedHistory) }
function migrateFavoritesToSharedStorage() { if (!Array.isArray(Storage.get<FavoriteItem[]>(FAVORITES_KEY, { shared: true }))) { const oldFavorites = Storage.get<FavoriteItem[]>(FAVORITES_KEY) ?? readOldICloudJSON<FavoriteItem[]>(OLD_FAVORITES_FILE); if (Array.isArray(oldFavorites)) saveFavorites(oldFavorites) } if (!Array.isArray(Storage.get<string[]>(FOLDERS_KEY, { shared: true }))) { const oldFolders = Storage.get<string[]>(FOLDERS_KEY) ?? readOldICloudJSON<string[]>(OLD_FOLDERS_FILE); if (Array.isArray(oldFolders)) saveFolders(oldFolders) } }
migrateLegacyData()
migrateFavoritesToSharedStorage()
