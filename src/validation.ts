import { BarcodeItem, BarcodeType, MAX_BARCODE_ITEMS, maxTextLength, typeName } from "./barcode_core"
export const MAX_FOLDER_DEPTH = 2
export function folderPathDepth(folder: string): number { return folder.split("/").filter(Boolean).length }
export function validateFolderDepth(folder: string): string | null {
  return folderPathDepth(folder) > MAX_FOLDER_DEPTH ? `文件夹最多支持 ${MAX_FOLDER_DEPTH} 级` : null
}
function deepestRelativeFolderDepth(sourceFolder: string, paths: string[]): number {
  const sourceDepth = folderPathDepth(sourceFolder)
  return Math.max(0, ...paths
    .filter((path) => path === sourceFolder || path.startsWith(`${sourceFolder}/`))
    .map((path) => folderPathDepth(path) - sourceDepth))
}
export function wouldExceedFolderDepthAfterMove(sourceFolder: string, parentFolder: string, paths: string[]): boolean {
  return folderPathDepth(parentFolder) + 1 + deepestRelativeFolderDepth(sourceFolder, paths) > MAX_FOLDER_DEPTH
}
export function wouldExceedFolderDepthAfterRename(sourceFolder: string, destinationFolder: string, paths: string[]): boolean {
  return folderPathDepth(destinationFolder) + deepestRelativeFolderDepth(sourceFolder, paths) > MAX_FOLDER_DEPTH
}
export const MAX_FOLDER_NAME_LENGTH = 50
export function validateFolderName(name: string): string | null { const value = name.trim(); if (!value) return "文件夹名称不能为空"; if (value === "." || value === "..") return "文件夹名称不能为 . 或 .."; if (value.length > MAX_FOLDER_NAME_LENGTH) return `文件夹名称不能超过 ${MAX_FOLDER_NAME_LENGTH} 个字符`; if (/[\\/\\:*?"<>|]/.test(value)) return "文件夹名称包含不支持的特殊字符"; return null }
// Empty paths represent uncategorized favorites. Check every segment before
// normalization so trimming or truncation cannot hide traversal in imported data.
export function validateFolderPath(folder: string): string | null {
  if (typeof folder !== "string") return "文件夹路径必须是文本"
  if (folder.trim().startsWith("/")) return "文件夹路径必须是相对路径"
  if (/[\\\u0000-\u001f\u007f]/.test(folder)) return "文件夹路径包含不支持的特殊字符"
  if (folder.split("/").some((part) => part.trim() === "." || part.trim() === "..")) return "文件夹路径不能包含 . 或 .."
  return null
}
export function collectNonEmptyTexts(inputRows: string[]): string[] { return inputRows.map((s) => s.trim()).filter((s) => s.length > 0) }
export function validateTexts(texts: string[], type: BarcodeType): string | null { if (texts.length > MAX_BARCODE_ITEMS) return `一次最多生成 ${MAX_BARCODE_ITEMS} 条条码`; const limit = maxTextLength(type); const tooLong = texts.findIndex((text) => { const value = ["ean13", "ean8", "upca", "itf14"].includes(type) ? text.replace(/\s/g, "") : text; return value.length > limit }); return tooLong >= 0 ? `第 ${tooLong + 1} 条内容过长：${typeName(type)}最多支持 ${limit} 个字符` : null }
export function isBarcodeItemValid(item: BarcodeItem): boolean { return item.type === "qr" ? item.qrImage != null : item.bits !== null }
