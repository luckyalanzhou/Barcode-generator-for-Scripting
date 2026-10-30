// 批量条码生成器 · Scripting 声明式 UI 版本
import {
  Script,
  Navigation,
  NavigationStack,
  ScrollView,
  ScrollViewReader,
  ScrollViewProxy,
  Group,
  VStack,
  HStack,
  ZStack,
  Text,
  TextField,
  Button,
  Image,
  Spacer,
  modifiers,
  useState,
  useRef,
  useEffect,
  useKeyboardVisible,
  RoundedRectangle,
  ImageRenderer,
  ColorPicker,
  Toggle,
  Picker,
  Slider,
  Divider,
} from "scripting"
import {
  BarcodeCanvas,
  BarcodeItem,
  BarcodeType,
  BARCODE_TYPES,
  typeName,
  encodeBarcode,
  scanTexts,
  StyleSettings,
  DEFAULT_STYLE,
  MAX_BARCODE_ITEMS,
} from "./src/barcode_core"
import { HistoryItem, FavoriteItem, InterchangeBackup, normalizeFavorite, parseInterchangeBackup, interchangeFoldersToPaths, joinFolder, loadHistory, saveHistory, loadFavorites, saveFavorites, loadFolders, saveFolders, loadSettings, saveSettings, HISTORY_MAX } from "./src/storage"
const BACKUP_MANIFEST_NAMES = ["barcode-generator-backup.json", "barcode-generator-backup-android.json"]
type HomeTab = "generate" | "favorites" | "history" | "settings"
const HOME_TABS: HomeTab[] = ["generate", "favorites", "history", "settings"]
function makeRowId(): string { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
function barcodeTypeHint(type: BarcodeType): string {
  return BARCODE_TYPES.find((item) => item.id === type)?.hint ?? ""
}
import { MAX_FOLDER_DEPTH, validateTexts as validateBarcodeTexts, collectNonEmptyTexts, isBarcodeItemValid, validateFolderDepth, validateFolderPath, wouldExceedFolderDepthAfterMove, wouldExceedFolderDepthAfterRename } from "./src/validation"
import { CS, schemeProps, lab, sub, ter, cardB, capB, pageB, inputT, FullScreenBg } from "./src/theme"
import { SettingsPage } from "./src/pages/SettingsPage"
import { BarcodesPage, PresentedBarcodes } from "./src/pages/BarcodesPage"
import { HistoryPage } from "./src/pages/HistoryPage"
import { FavoritesPage } from "./src/pages/FavoritesPage"

declare const Dialog: any
async function alert(message: string): Promise<void> {
  await Dialog.alert({ message })
}
function checkFolderPaths(paths: string[]): boolean {
  const error = paths.map(validateFolderPath).find(Boolean)
  if (error) { void alert(error); return false }
  return true
}
function favoriteListsMatch(actual: FavoriteItem[], expected: FavoriteItem[]): boolean {
  return actual.length === expected.length && actual.every((saved, index) => {
    const source = expected[index]
    return saved.id === source.id && saved.name === source.name && saved.type === source.type &&
      saved.time === source.time && saved.folder === source.folder && saved.texts.length === source.texts.length &&
      saved.texts.every((text, textIndex) => text === source.texts[textIndex])
  })
}
function favoritesPersisted(expected: FavoriteItem[]): boolean {
  try { return favoriteListsMatch(loadFavorites(), expected) } catch { return false }
}
function folderPathsPersisted(present: string[], absent: string[] = []): boolean {
  if (present.length === 0 && absent.length === 0) return true
  try {
    const saved = loadFolders()
    return present.every((folder) => saved.includes(folder)) && absent.every((folder) => !saved.includes(folder))
  } catch { return false }
}
function restoreFolderState(folders: string[], favorites?: FavoriteItem[]) {
  saveFolders(folders)
  if (favorites !== undefined) saveFavorites(favorites)
}
declare const FileManager: any
declare const Data: any







function View() {
  // 每个条码独立一行输入；扫描结果会按行追加到列表
  const [inputRows, setInputRows] = useState<string[]>([""])
  const hasInput = inputRows.some((row) => row.trim().length > 0)
  const [items, setItems] = useState<BarcodeItem[]>([])
  const [showBarcodes, setShowBarcodes] = useState(false)
  const [forceUnfavorited, setForceUnfavorited] = useState(false)
  // 关闭整个应用（全屏呈现的主页面，dismiss 后脚本退出）
  const dismiss = Navigation.useDismiss()
  // 记录刚被点击的功能键，用于“点击变浅蓝”效果
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  // 滚动控制：添加输入后自动滚到新行
  const scrollProxyRef = useRef<ScrollViewProxy>()
  // 最近生成历史（从持久化读取）
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  // 收藏（从持久化读取）
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => loadFavorites())
  // 收藏文件夹路径（例如 工作/客户）
  const [folders, setFolders] = useState<string[]>(() => loadFolders())

  // 当前选择的条码类型（默认 Code 128-B）
  const [barcodeType, setBarcodeType] = useState<BarcodeType>("code128")
  // 样式设置（从持久化读取）
  const [settings, setSettings] = useState<StyleSettings>(() => loadSettings())
  // 外观设置（跟随系统/浅色/深色）——作为各取色函数的参数
  const colorScheme = settings.colorScheme
  // 键盘是否可见（用于在输入框右上角显示「完成」按钮收起键盘）
  const keyboardVisible = useKeyboardVisible()
  // 分离标签高亮和页面内容状态，避免切换页面时先等待目标页面挂载才更新颜色。
  const [activeTab, setActiveTab] = useState<HomeTab>("generate")
  const [selectedTab, setSelectedTab] = useState<HomeTab>("generate")
  const pendingTabSwitchRef = useRef<number | null>(null)

  function cancelPendingTabSwitch() {
    if (pendingTabSwitchRef.current !== null) {
      clearTimeout(pendingTabSwitchRef.current)
      pendingTabSwitchRef.current = null
    }
  }

  function selectHomeTab(tab: HomeTab) {
    cancelPendingTabSwitch()
    setSelectedTab(tab)
    setActiveTab(tab)
  }

  function selectHomeTabFromBar(tab: HomeTab) {
    cancelPendingTabSwitch()
    setSelectedTab(tab)
    if (tab === activeTab) return

    // 先让底栏高亮有机会提交，再挂载目标页面，避免重页面渲染拖慢选中色更新。
    pendingTabSwitchRef.current = setTimeout(() => {
      pendingTabSwitchRef.current = null
      setActiveTab(tab)
    }, 32)
  }

  useEffect(() => () => cancelPendingTabSwitch(), [])

  // 在页面容器上处理横向切换，保留原来的左右滑动交互。
  function handleTabSwipe(details: {
    location: { x: number, y: number },
    startLocation: { x: number, y: number },
    translation: { x: number, y: number },
  }) {
    // 以起点和终点计算方向。部分 Scripting/iOS 版本对 translation 的符号
    // 处理不稳定，坐标差值更可靠；translation 仅作为兼容回退。
    const locationX = details.location?.x
    const startX = details.startLocation?.x
    const locationY = details.location?.y
    const startY = details.startLocation?.y
    const x = Number.isFinite(locationX) && Number.isFinite(startX)
      ? locationX - startX
      : details.translation.x
    const y = Number.isFinite(locationY) && Number.isFinite(startY)
      ? locationY - startY
      : details.translation.y
    // 横向距离不足或纵向分量更大时交给页面自己的滚动处理。
    if (Math.abs(x) < 45 || Math.abs(x) <= Math.abs(y)) return
    const currentIndex = HOME_TABS.indexOf(activeTab)
    const nextIndex = currentIndex + (x < 0 ? 1 : -1)
    if (nextIndex >= 0 && nextIndex < HOME_TABS.length) {
      selectHomeTab(HOME_TABS[nextIndex])
    }
  }
  // 用于可靠激活输入：点击输入框时自增，触发输入框 remount+autofocus 唤出键盘
  const [inputFocusTick, setInputFocusTick] = useState(0)
  // 生成中的同步锁：同时拦截快速连点和异步生成期间的重复跳转。
  const generatingRef = useRef(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // 点击时短暂显示浅蓝色，随后恢复灰色玻璃
  function flashPressed(key: string) {
    setPressedKey(key)
    setTimeout(() => setPressedKey(null), 300)
  }

  // 相机文字识别：每个识别结果独立成为一个输入框，追加到当前列表
  async function scanInput(): Promise<boolean> {
    const texts = await scanTexts()
    if (texts === null) return false
    const existing = inputRows.filter((text) => text.trim().length > 0)
    const available = Math.max(0, MAX_BARCODE_ITEMS - existing.length)
    const accepted = texts.slice(0, available)
    setInputRows([...existing, ...accepted])
    if (accepted.length < texts.length) {
      await alert(`当前最多保留 ${MAX_BARCODE_ITEMS} 条，扫描结果有 ${texts.length - accepted.length} 条未加入`)
    }
    return true
  }

  async function scanFromGenerateTab() {
    if (await scanInput()) selectHomeTab("generate")
  }

  // 小组件“识别文字填充”入口：通过 run URL 启动脚本后自动打开识别
  useEffect(() => {
    const action = Script.queryParameters?.action
    if (action === "scan") {
      // 运行 URL 已进入脚本后立即打开扫描，不再等待首页动画
      void scanInput()
    } else if (action === "favorites") {
      setTimeout(() => { selectHomeTab("favorites") }, 250)
    }
  }, [])

  function updateInputRow(index: number, value: string) {
    setInputRows((prev) => prev.map((s, i) => (i === index ? value : s)))
  }

  function moveInputRow(index: number, offset: number) {
    setInputRows((prev) => {
      const target = index + offset
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const current = next[index]
      next[index] = next[target]
      next[target] = current
      return next
    })
  }

  function deleteInputRow(index: number) {
    setInputRows((prev) => {
      if (prev.length === 1) return [""]
      return prev.filter((_, i) => i !== index)
    })
  }

  function addInputRow() {
    setInputRows((prev) => {
      const nonEmpty = prev.filter((s) => s.trim().length > 0).length
      if (prev.length >= MAX_BARCODE_ITEMS || nonEmpty >= MAX_BARCODE_ITEMS) return prev
      return [...prev, ""]
    })
  }

  function clearAllInputRows() {
    setInputRows([""])
  }

  // 生成条码内容：QR 用原生 API 生成图片，其余一维条码用位模式编码
  async function buildItems(texts: string[], type: BarcodeType): Promise<BarcodeItem[]> {
    if (type === "qr") {
      const list: BarcodeItem[] = []
      for (const text of texts) {
        let img: UIImage | null = null
        try {
          img = await QRCode.generate(text)
        } catch {
          img = null
        }
        list.push({ text, bits: null, type, qrImage: img })
      }
      return list
    }
    return texts.map((text) => ({ text, bits: encodeBarcode(type, text), type }))
  }

  // 校验数量及各格式长度；固定长度格式的精确格式校验仍由编码器负责。
  async function showGenerationFailure(reason: string) {
    await Dialog.actionSheet({
      title: "生成失败",
      message: reason,
      cancelButton: false,
      actions: [{ label: "返回修改" }],
    })
  }

  // 收集每个输入框的内容：空行忽略，每行生成一个条码
  function collectTexts(): string[] | null {
    const texts = inputRows.map((s) => s.trim()).filter((s) => s.length > 0)
    if (texts.length === 0) {
      alert("请输入内容")
      return null
    }
    if (texts.length > MAX_BARCODE_ITEMS) {
      alert(`一次最多生成 ${MAX_BARCODE_ITEMS} 条条码`)
      return null
    }
    return texts
  }

  // 按指定格式生成并跳转（同时记录最近生成历史：同内容去重置顶，最多保留 HISTORY_MAX 条）
  async function doGenerate(texts: string[], type: BarcodeType) {
    const validationError = validateBarcodeTexts(texts, type)
    if (validationError) {
      await showGenerationFailure(validationError)
      return
    }
    const generated = await buildItems(texts, type)
    const failed = generated.findIndex((item) => !itemOkForGeneration(item))
    if (failed >= 0) {
      await showGenerationFailure(`第 ${failed + 1} 条内容无法生成：格式或校验位错误`)
      return
    }
    setBarcodeType(type)
    setForceUnfavorited(false)
    setItems(generated)
    const key = `${type}\u0001${texts.join("\u0001")}`
    const next = [
      { id: makeRowId(), texts, type, time: Date.now() },
      ...history.filter((h) => `${h.type ?? "code128"}\u0001${h.texts.join("\u0001")}` !== key),
    ].slice(0, HISTORY_MAX)
    setHistory(next)
    saveHistory(next)
    // 跳转到新页面展示条形码（普通页面跳转）
    setShowBarcodes(true)
  }

  function itemOkForGeneration(item: BarcodeItem): boolean { return isBarcodeItemValid(item) }

  // 单击生成条码：使用当前选中的条码格式生成
  async function generate() {
    if (generatingRef.current) return
    generatingRef.current = true
    setIsGenerating(true)
    try {
      const texts = collectTexts()
      if (texts === null) return
      await doGenerate(texts, barcodeType)
    } finally {
      generatingRef.current = false
      setIsGenerating(false)
    }
  }

  // 长按生成条码：弹出选项选择其他格式
  async function generateWithPicker() {
    if (generatingRef.current) return
    generatingRef.current = true
    setIsGenerating(true)
    try {
      const texts = collectTexts()
      if (texts === null) return
      const index = await Dialog.actionSheet({
      title: "选择条码格式",
      message: texts.length === 1 ? texts[0] : `共 ${texts.length} 条内容`,
      cancelButton: true,
      actions: BARCODE_TYPES.map((t) => ({ label: t.name })),
    })
      if (index === null) return
      await doGenerate(texts, BARCODE_TYPES[index].id)
    } finally {
      generatingRef.current = false
      setIsGenerating(false)
    }
  }


  async function chooseBarcodeType() {
    const index = await Dialog.actionSheet({ title: "选择条码格式", cancelButton: true, actions: BARCODE_TYPES.map((t) => ({ label: t.name })) })
    if (index !== null) setBarcodeType(BARCODE_TYPES[index].id)
  }

  // 清空最近生成历史
  async function clearHistory() {
    const confirmed = await Dialog.confirm({
      title: "清空历史记录",
      message: "确定要清空全部历史记录吗？此操作无法撤销。",
      cancelLabel: "取消",
      confirmLabel: "清空",
    })
    if (!confirmed) return
    setHistory([])
    saveHistory([])
  }

  function editFavorite(texts: string[], type: BarcodeType) {
    setInputRows(texts.length > 0 ? [...texts] : [""])
    setBarcodeType(type)
    setForceUnfavorited(true)
    selectHomeTab("generate")
  }

  // 更新样式设置并持久化
  function updateSettings(patch: Partial<StyleSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  // 收藏当前生成内容（总名称与文件夹由用户在弹窗自定义；允许相同内容重复收藏）
  // 收藏不单独保存样式，恢复和分享时统一使用当前全局样式。
  async function addFavorite(name: string, folder: string, sourceItems: BarcodeItem[] = items) {
    const depthError = validateFolderDepth(folder)
    if (depthError) { void alert(depthError); return }
    const texts = sourceItems.map((i) => i.text)
    const sourceType = sourceItems[0]?.type ?? barcodeType
    const sameName = favorites.find((f) => f.name === name && (f.type ?? "code128") === sourceType)
    if (sameName) {
      const choice = await Dialog.actionSheet({
        title: "覆盖收藏",
        message: `已存在名为「${name}」的收藏，是否覆盖？`,
        cancelButton: true,
        actions: [{ label: "覆盖", destructive: true }],
      })
      if (choice !== 0) return
    }
    const next = [
      { id: sameName?.id ?? makeRowId(), name, texts, type: sourceType, time: Date.now(), folder },
      ...favorites.filter((f) => f.id !== sameName?.id),
    ]
    if (!checkFolderPaths(next.map((favorite) => favorite.folder))) return
    setFavorites(next)
    saveFavorites(next)
  }

  async function exportBackup() {
    let archiveRoot: string | null = null
    let archivePath: string | null = null
    try {
      for (const folder of [...folders, ...favorites.map((favorite) => favorite.folder)]) {
        const error = validateFolderPath(folder)
        if (error) throw new Error(error)
      }
      const stamp = makeRowId()
      archiveRoot = `${FileManager.temporaryDirectory}/barcode-generator-backup-${stamp}`
      archivePath = `${FileManager.temporaryDirectory}/barcode-generator-backup-${stamp}.zip`
      FileManager.createDirectorySync(`${archiveRoot}/favorites`, true)
      for (const folder of folders) FileManager.createDirectorySync(`${archiveRoot}/favorites/${folder}`, true)
      for (const favorite of favorites) {
        const folder = favorite.folder ? `/${favorite.folder}` : ""
        const path = `${archiveRoot}/favorites${folder}/${encodeURIComponent(favorite.id)}.json`
        FileManager.createDirectorySync(path.slice(0, path.lastIndexOf("/")), true)
        FileManager.writeAsStringSync(path, JSON.stringify(favorite, null, 2))
      }
      await FileManager.zip(archiveRoot, archivePath, true)
      const data = Data.fromFile(archivePath)
      if (!data) throw new Error("无法生成备份压缩包")
      const exported = await DocumentPicker.exportFiles({ files: [{ data, name: "barcode-generator-backup.zip" }] })
      if (!exported || exported.length === 0) return
      await Dialog.alert({ title: "导出完成", message: `备份压缩包已导出：${favorites.length} 条收藏` })
    } catch (error) {
      await Dialog.alert({ title: "导出失败", message: error instanceof Error ? error.message : String(error) })
    } finally {
      if (archiveRoot && FileManager.existsSync(archiveRoot)) FileManager.removeSync(archiveRoot)
      if (archivePath && FileManager.existsSync(archivePath)) FileManager.removeSync(archivePath)
    }
  }

  async function importBackup() {
    let paths: string[] | null | undefined
    try {
      paths = await DocumentPicker.pickFiles()
    } catch (error) {
      await Dialog.alert({ title: "备份导入失败", message: error instanceof Error ? error.message : String(error) })
      return
    }
    if (!paths || paths.length === 0) return
    let extractedPath: string | null = null
    try {
      const path = paths[0]
      if (typeof path !== "string" || !path.trim()) throw new Error("未选择有效的备份文件")
      let importedFolders: string[]
      let importedFavorites: FavoriteItem[]
      let invalidFavoriteCount = 0
      function fromInterchange(parsed: InterchangeBackup) {
        const folders = interchangeFoldersToPaths(parsed)
        const favorites: FavoriteItem[] = parsed.favorites.map((favorite) => ({
          id: favorite.id || makeRowId(), name: favorite.name, texts: favorite.texts.slice(),
          type: favorite.type ?? "code128", time: favorite.time ?? Date.now(),
          folder: joinFolder(favorite.rootFolder, favorite.subFolder),
        }))
        return {
          folders,
          favorites,
          rootCount: parsed.folders.length,
          childCount: parsed.folders.reduce((total, root) => total + root.children.length, 0),
        }
      }
      if (path.toLowerCase().endsWith(".zip")) {
        extractedPath = `${FileManager.temporaryDirectory}/barcode-generator-import-${makeRowId()}`
        FileManager.createDirectorySync(extractedPath, true)
        await FileManager.unzip(path, extractedPath)
        // 安卓备份的清单位于 ZIP 根目录。不同安卓版本使用两个合法文件名，
        // 先按确定路径读取，避免某些 Scripting 版本目录返回格式的影响。
        let manifest: string | undefined = BACKUP_MANIFEST_NAMES
          .map((name) => `${extractedPath}/${name}`)
          .find((candidate) => FileManager.isFileSync(candidate))
        // 同时兼容由其他工具压缩、带一层外部文件夹的备份包。
        if (!manifest) {
          const entries = FileManager.readDirectorySync(extractedPath, true)
            .map((entry: string) => entry.startsWith("/") ? entry : `${extractedPath}/${entry}`)
          manifest = entries.find((entry: string) =>
            BACKUP_MANIFEST_NAMES.includes(entry.replace(/\\/g, "/").split("/").pop() || "") &&
            FileManager.isFileSync(entry)
          )
        }
        if (manifest && FileManager.isFileSync(manifest)) {
          const manifestData = JSON.parse(FileManager.readAsStringSync(manifest).trim().replace(/^\uFEFF/, ""))
          // 仅保留安卓整体清单兼容；旧 iOS 整体 JSON 没有 payload，不再导入。
          if (!manifestData || typeof manifestData.payload !== "string") {
            throw new Error("不再支持旧版整体 JSON 备份，请使用新版文件夹备份")
          }
          const restored = fromInterchange(parseInterchangeBackup(manifestData))
          importedFolders = restored.folders
          importedFavorites = restored.favorites
        } else {
          // 新版 iOS 备份不再写整体清单：直接根据 favorites/ 下的文件夹和
          // 单条收藏 JSON 恢复，保留空文件夹和每个收藏文件的独立存储结构。
          const entries = FileManager.readDirectorySync(extractedPath, true)
            .map((entry: string) => entry.startsWith("/") ? entry : `${extractedPath}/${entry}`)
          const archiveFolderPath = (entry: string, isDirectory: boolean): string | null => {
            const normalized = entry.replace(/\\/g, "/")
            const marker = "/favorites/"
            const markerIndex = normalized.indexOf(marker)
            if (markerIndex < 0) return null
            const parts = normalized.slice(markerIndex + marker.length).split("/").filter(Boolean)
            if (!isDirectory) parts.pop()
            const folder = parts.join("/")
            const depthError = validateFolderDepth(folder)
            if (depthError) throw new Error(depthError)
            return folder
          }
          const fileFavorites = entries
            .filter((entry: string) => FileManager.isFileSync(entry) && entry.toLowerCase().endsWith(".json"))
            .map((entry: string) => {
              if (archiveFolderPath(entry, false) === null) return null
              let parsed: any
              try { parsed = JSON.parse(FileManager.readAsStringSync(entry).trim().replace(/^\uFEFF/, "")) } catch {
                invalidFavoriteCount++
                return null
              }
              if (typeof parsed?.folder === "string") {
                const error = validateFolderPath(parsed.folder)
                if (error) throw new Error(error)
                const depthError = validateFolderDepth(parsed.folder)
                if (depthError) throw new Error(depthError)
              }
              const favorite = normalizeFavorite(parsed)
              if (!favorite && !(entry.replace(/\\/g, "/").endsWith("/index.json") && Array.isArray(parsed?.ids))) {
                invalidFavoriteCount++
              }
              return favorite
            })
            .filter((favorite: FavoriteItem | null): favorite is FavoriteItem => favorite !== null)
          const folderPaths = entries
            .filter((entry: string) => FileManager.isDirectorySync(entry))
            .map((entry: string) => archiveFolderPath(entry, true))
            .filter((folder: string | null): folder is string => folder !== null && folder !== "")
          importedFavorites = fileFavorites
          importedFolders = Array.from(new Set([...folderPaths, ...fileFavorites.map((favorite) => favorite.folder).filter(Boolean)]))
          if (importedFolders.length === 0 && importedFavorites.length === 0) throw new Error("压缩包中没有可导入的收藏文件或文件夹")
        }
      } else {
        throw new Error("仅支持新版文件夹 ZIP 备份或安卓 ZIP 备份")
      }
      // 导入采用合并策略：保留当前收藏和文件夹；同条码格式下同名收藏统一询问是否覆盖。
      // 覆盖时沿用当前收藏的 id，避免旧的独立收藏文件残留或发生 id 冲突。
      const mergedFolders = Array.from(new Set([...folders, ...importedFolders]))
      const mergedFavorites = [...favorites]
      let addedCount = 0
      let overwrittenCount = 0
      let skippedCount = invalidFavoriteCount
      const duplicateNames = Array.from(new Set(importedFavorites
        .filter((imported) => mergedFavorites.some((existing) =>
          existing.name === imported.name &&
          (existing.type ?? "code128") === (imported.type ?? "code128")
        ))
        .map((imported) => imported.name)))
      let overwriteDuplicates = false
      if (duplicateNames.length > 0) {
        overwriteDuplicates = await Dialog.confirm({
          title: "发现重复收藏",
          message: `备份中有 ${duplicateNames.length} 个收藏名称与当前数据重复，是否全部覆盖？`,
          cancelLabel: "取消",
          confirmLabel: "全部覆盖",
        })
      }
      for (const imported of importedFavorites) {
        const sameNameIndex = mergedFavorites.findIndex((existing) =>
          existing.name === imported.name &&
          (existing.type ?? "code128") === (imported.type ?? "code128")
        )
        if (sameNameIndex >= 0) {
          const existing = mergedFavorites[sameNameIndex]
          if (!overwriteDuplicates) {
            skippedCount++
            continue
          }
          mergedFavorites[sameNameIndex] = { ...imported, id: existing.id }
          overwrittenCount++
          continue
        }

        // 备份中的 id 可能与本机另一条收藏冲突；此时生成新 id，避免覆盖错误文件。
        const idConflict = mergedFavorites.some((existing) => existing.id === imported.id)
        mergedFavorites.push(idConflict ? { ...imported, id: makeRowId() } : imported)
        addedCount++
      }
      for (const folder of [...mergedFolders, ...mergedFavorites.map((favorite) => favorite.folder)]) {
        const error = validateFolderPath(folder)
        if (error) throw new Error(error)
      }
      saveFolders(mergedFolders)
      saveFavorites(mergedFavorites)
      const savedFolders = loadFolders()
      const savedFavorites = loadFavorites()
      const expectedFolderPaths = new Set([
        ...mergedFolders,
        ...mergedFavorites.map((favorite) => favorite.folder).filter(Boolean),
      ])
      for (const folder of Array.from(expectedFolderPaths)) {
        const parts = folder.split("/").filter(Boolean)
        if (parts.length === 2) expectedFolderPaths.add(parts[0])
      }
      const foldersMatch =
        new Set(savedFolders).size === savedFolders.length &&
        mergedFolders.every((folder) => savedFolders.includes(folder)) &&
        savedFolders.every((folder) => expectedFolderPaths.has(folder))
      const favoritesMatch = favoriteListsMatch(savedFavorites, mergedFavorites)
      if (!foldersMatch || !favoritesMatch) {
        restoreFolderState(folders, favorites)
        throw new Error("备份保存校验失败：保存内容与导入结果不一致")
      }
      setFolders(savedFolders)
      setFavorites(savedFavorites)
      await alert(`备份合并完成：新增 ${addedCount} 条，覆盖 ${overwrittenCount} 条，跳过 ${skippedCount} 条；当前共 ${savedFavorites.length} 条收藏`)
    } catch (error) {
      await Dialog.alert({ title: "备份导入失败", message: error instanceof Error ? error.message : String(error) })
    } finally {
      if (extractedPath && FileManager.existsSync(extractedPath)) FileManager.removeSync(extractedPath)
      if (typeof DocumentPicker.stopAcessingSecurityScopedResources === "function") DocumentPicker.stopAcessingSecurityScopedResources()
    }
  }
  async function renameFavorite(id: string, name: string) {
    const existing = favorites.find((f) => f.name === name && f.id !== id && (f.type ?? "code128") === (favorites.find((item) => item.id === id)?.type ?? "code128"))
    if (existing) {
      const choice = await Dialog.actionSheet({
        title: "覆盖收藏",
        message: `已存在名为「${name}」的收藏，是否覆盖？`,
        cancelButton: true,
        actions: [{ label: "覆盖", destructive: true }],
      })
      if (choice !== 0) return
      const source = favorites.find((f) => f.id === id)
      if (!source) return
      const next = favorites.filter((f) => f.id !== existing.id && f.id !== id).concat({ ...source, id: existing.id, name, time: Date.now() })
      if (!checkFolderPaths(next.map((favorite) => favorite.folder))) return
      setFavorites(next)
      saveFavorites(next)
      return
    }
    const next = favorites.map((f) => f.id === id ? { ...f, name } : f)
    if (!checkFolderPaths(next.map((favorite) => favorite.folder))) return
    setFavorites(next)
    saveFavorites(next)
  }

  // 删除收藏
  function removeFavorite(id: string) {
    const next = favorites.filter((f) => f.id !== id)
    if (!checkFolderPaths(next.map((favorite) => favorite.folder))) return
    setFavorites(next)
    saveFavorites(next)
  }

  // 移动单条收藏到指定文件夹
  function moveFavorite(id: string, folder: string) {
    const source = favorites.find((f) => f.id === id)
    const depthError = validateFolderDepth(folder)
    if (depthError) { void alert(depthError); return }
    // 收藏文件可以从一级目录移动到其下的二级目录；只禁止移动到原目录。
    if (source && folder === (source.folder || "")) {
      void alert("不能将收藏移动到当前文件夹")
      return
    }
    const next = favorites.map((f) => f.id === id ? { ...f, folder } : f)
    if (!checkFolderPaths(next.map((favorite) => favorite.folder))) return
    setFavorites(next)
    saveFavorites(next)
  }

  function createFolder(parentFolder: string, name: string) {
    const path = parentFolder ? `${parentFolder}/${name}` : name
    const depthError = validateFolderDepth(path)
    if (depthError) { void alert(depthError); return }
    const next = Array.from(new Set([...folders, path]))
    if (!checkFolderPaths(next)) return
    saveFolders(next)
    if (!folderPathsPersisted([path])) {
      restoreFolderState(folders)
      void alert("文件夹创建未能保存，已取消本次操作")
      return
    }
    setFolders(next)
  }

  function deleteFolder(folder: string) {
    const prefix = `${folder}/`
    const removedFolderPaths = folders.filter((path) => path === folder || path.startsWith(prefix))
    const nextFolders = folders.filter((f) => f !== folder && !f.startsWith(prefix))
    const nextFavorites = favorites.filter((f) => {
      const current = f.folder || ""
      return current !== folder && !current.startsWith(prefix)
    })
    if (!checkFolderPaths([...nextFolders, ...nextFavorites.map((favorite) => favorite.folder)])) return
    saveFolders(nextFolders)
    saveFavorites(nextFavorites)
    if (!folderPathsPersisted([], removedFolderPaths) || !favoritesPersisted(nextFavorites)) {
      restoreFolderState(folders, favorites)
      void alert("文件夹删除未能保存，已取消本次操作")
      return
    }
    setFolders(Array.from(new Set(nextFolders)))
    setFavorites(nextFavorites)
  }

  function moveFolder(folder: string, parentFolder: string) {
    if (parentFolder === folder || parentFolder.startsWith(`${folder}/`)) {
      void alert("不能将文件夹移动到自身或子文件夹")
      return
    }
    const folderName = folder.slice(folder.lastIndexOf("/") + 1)
    const destination = parentFolder ? `${parentFolder}/${folderName}` : folderName
    if (destination === folder) return
    const knownPaths = [...folders, ...favorites.map((favorite) => favorite.folder || "")]
    if (wouldExceedFolderDepthAfterMove(folder, parentFolder, knownPaths)) {
      void alert(`文件夹最多支持 ${MAX_FOLDER_DEPTH} 级，请先移动或删除子文件夹`)
      return
    }
    const movedFolderPaths = folders.filter((path) => path === folder || path.startsWith(`${folder}/`))
    const nextFolders = folders.map((f) => {
      if (f !== folder && !f.startsWith(`${folder}/`)) return f
      const suffix = f.slice(folder.length)
      return `${destination}${suffix}`
    })
    const nextFavorites = favorites.map((f) => {
      const current = f.folder || ""
      if (current !== folder && !current.startsWith(`${folder}/`)) return f
      const suffix = current.slice(folder.length)
      return { ...f, folder: `${destination}${suffix}` }
    })
    if (!checkFolderPaths([...nextFolders, ...nextFavorites.map((favorite) => favorite.folder)])) return
    saveFolders(nextFolders)
    saveFavorites(nextFavorites)
    const movedDestinations = movedFolderPaths.map((path) => `${destination}${path.slice(folder.length)}`)
    if (!folderPathsPersisted(movedDestinations, movedFolderPaths) || !favoritesPersisted(nextFavorites)) {
      restoreFolderState(folders, favorites)
      void alert("文件夹移动未能保存，已取消本次操作")
      return
    }
    setFolders(Array.from(new Set(nextFolders)))
    setFavorites(nextFavorites)
  }

  function renameFolder(oldFolder: string, newFolder: string) {
    if (newFolder === oldFolder) return
    if (!checkFolderPaths([newFolder])) return
    const knownPaths = [...folders, ...favorites.map((favorite) => favorite.folder || "")]
    if (wouldExceedFolderDepthAfterRename(oldFolder, newFolder, knownPaths)) {
      void alert(`文件夹最多支持 ${MAX_FOLDER_DEPTH} 级，请先移动或删除子文件夹`)
      return
    }
    const next = favorites.map((f) => {
      const current = f.folder || ""
      return current === oldFolder || current.startsWith(`${oldFolder}/`)
        ? { ...f, folder: `${newFolder}${current.slice(oldFolder.length)}` }
        : f
    })
    const nextFolders = folders.map((f) =>
      f === oldFolder || f.startsWith(`${oldFolder}/`)
        ? `${newFolder}${f.slice(oldFolder.length)}`
        : f
    )
    if (!checkFolderPaths([...nextFolders, ...next.map((favorite) => favorite.folder)])) return
    const renamedFolderPaths = folders.filter((path) => path === oldFolder || path.startsWith(`${oldFolder}/`))
    saveFolders(nextFolders)
    saveFavorites(next)
    const renamedDestinations = renamedFolderPaths.map((path) => `${newFolder}${path.slice(oldFolder.length)}`)
    if (!folderPathsPersisted(renamedDestinations, renamedFolderPaths) || !favoritesPersisted(next)) {
      restoreFolderState(folders, favorites)
      void alert("文件夹重命名未能保存，已取消本次操作")
      return
    }
    setFolders(nextFolders)
    setFavorites(next)
  }


  return (
    <NavigationStack>
      <ScrollViewReader>
        {(proxy) => {
          scrollProxyRef.current = proxy
          // 根视图修饰符：4 个导航目标（外观覆盖在 ScrollView 元素上用 schemeProps 属性传入）
          let rootMods = modifiers()
            .navigationDestination({
              isPresented: showBarcodes,
              onChanged: setShowBarcodes,
              content: (
                <BarcodesPage
                  items={items}
                  settings={settings}
                  favorites={favorites}
                  folders={folders}
                  onClose={() => setShowBarcodes(false)}
                  onFavorite={addFavorite}
                  onCreateFolder={createFolder}
                  forceUnfavorited={forceUnfavorited}
                  showCustomBack={false}
                />
              ),
            })
                     rootMods = rootMods
             .safeAreaInset({
               top: {
                 alignment: 'leading',
                 spacing: 0,
                 content: (
                   <HStack spacing={8} modifiers={modifiers().frame({ maxWidth: 'infinity', height: 56, alignment: 'center' }).padding({ top: 12, leading: 14, trailing: 14 })}>
                     <Spacer />
                     <Button action={() => { flashPressed("close"); dismiss() }} modifiers={modifiers().frame({ width: 44, height: 44, alignment: 'center' }).padding(0).font(25).foregroundStyle(pressedKey === "close" ? "#3b82f6" : sub(colorScheme)).contentShape({ type: "rect", cornerRadius: 16 })}>
                       <Image systemName="xmark" renderingMode="template" />
                     </Button>
                   </HStack>
                 ),
               },
             })
             .frame({ maxWidth: 'infinity', maxHeight: 'infinity' })
           // 输入框背后的卡片视觉（仅供背景/边框，不接收手势；手势在顶层捕获层）。
          // 本框架下「高的多行 TextField」的点击聚焦不可靠，所以用 ZStack 分三层：
          //   下层 卡片视觉(本 inputCardModifiers + VStack)
          //   中层 文本框(inputTextModifiers，固定高度，超长内容在框内滚动)
          //   顶层 透明点击捕获层(inputCatcherModifiers)：点输入框任意处(留白/文字区)
          //        → inputFocusTick 自增 → 文本框 remount+autofocus 真正唤出键盘。
          let inputCardModifiers = modifiers()
            .frame({ maxWidth: 'infinity', minHeight: 88, maxHeight: 88, alignment: 'topLeading' })
            .padding(8)
            .background({
              style: capB(colorScheme),
              shape: { type: "rect", cornerRadius: 16 },
            })
            .overlay({
              alignment: "center",
              content: (
                <RoundedRectangle
                  cornerRadius={16}
                  stroke={{
                    shapeStyle: "rgba(128, 128, 128, 0.35)",
                    strokeStyle: { lineWidth: 1 },
                  }}
                />
              ),
            })
          // 文本框修饰符：固定高度(不随内容延伸，超长内容在框内滚动)，无背景。
          // 背景由下层卡片提供，二者均带 padding(8) 使文字与卡片内容区对齐。
          let inputTextModifiers = modifiers()
            .frame({ maxWidth: 'infinity', minHeight: 88, maxHeight: 88, alignment: 'topLeading' })
            .font(18)
            .foregroundStyle(inputT(colorScheme))
            .padding(8)
          // 点击捕获层(最上层，透明)：本框架下"高的多行 TextField"的点击聚焦不可靠，
          // 改为"点输入框任意处 → inputFocusTick 自增 → 文本框 remount+autofocus 真正唤出键盘"。
          // 用 ZStack 把它放在文本框之后(最顶)，保证任意点击都命中它(留白/文字区皆可)。
          let inputCatcherModifiers = modifiers()
            .frame({ maxWidth: 'infinity', minHeight: 88, maxHeight: 88, alignment: 'topLeading' })
            .contentShape({ type: "rect", cornerRadius: 16 })
            .onTapGesture(() => setInputFocusTick((k) => k + 1))
          // 键盘可见时在捕获层右上角(最顶)叠加「完成」按钮收起键盘(顶层，不被捕获层拦截)。
          if (keyboardVisible) {
            inputCatcherModifiers = inputCatcherModifiers.overlay({
              alignment: "topTrailing",
              content: (
                <Button
                  title="完成"
                  action={() => Keyboard.hide()}
                  modifiers={modifiers()
                    .fontWeight("bold")
                    .foregroundStyle(lab(colorScheme))
                    .padding({ top: 8, leading: 16, trailing: 16, bottom: 8 })
                    .background({
                      style: cardB(colorScheme),
                      shape: { type: "rect", cornerRadius: 10 },
                    })
                    .contentShape({ type: "rect", cornerRadius: 10 })}
                />
              ),
            })
          }
          return (
            // 注意：首页 ScrollView 拥有全部导航目标（rootMods 里的 navigationDestination）。
            // 不能把 preferredColorScheme 加在这里——运行中切换外观会改变这个「导航宿主」视图的
            // preferredColorScheme，导致框架重置导航栈、把已 push 的设置页弹回首页。
            // 因此各导航页面（设置/条码/历史/收藏）在自己的根 ScrollView 上分别应用 schemeProps。
            <VStack spacing={0} modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" })}>
              <VStack
                spacing={0}
                modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" })}
                onDragGesture={{
                  minDistance: 20,
                  coordinateSpace: "local",
                  onEnded: handleTabSwipe,
                }}
              >
              {activeTab === "generate" && (
            <VStack spacing={0} modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" })}>
            <FullScreenBg cs={colorScheme}>
              <VStack
                spacing={0}
                modifiers={modifiers()
                  .frame({ maxWidth: 'infinity', maxHeight: 'infinity' })
                  .ignoresSafeArea({ regions: 'keyboard', edges: 'bottom' })}
              >
                <ScrollView
                  scrollDismissesKeyboard="never"
                  modifiers={rootMods}
                 >
                 <VStack
          alignment="center"
          spacing={15.9}
          padding={{ top: 23.35, leading: 20, bottom: 20, trailing: 20 }}
        >
          <VStack alignment="leading" spacing={6} modifiers={modifiers().frame({ maxWidth: 'infinity' }).padding({ bottom: 6 })}>
            <HStack spacing={10} alignment="center">
              <Image
                systemName="barcode.viewfinder"
                renderingMode="template"
                modifiers={modifiers()
                  .font(28)
                  .foregroundStyle("#3b82f6")}
              />
              <Text
                font={26}
                fontWeight="bold"
                modifiers={modifiers().foregroundStyle(lab(colorScheme))}
              >
                条码生成器
              </Text>
            </HStack>
          </VStack>
          {/* 逐行输入：识别的文字各占一行，可单独编辑、排序和删除。 */}
           <VStack alignment="leading" spacing={10} modifiers={modifiers().frame({ maxWidth: 'infinity' })}>
              <ScrollView modifiers={modifiers().frame({ maxWidth: 'infinity', maxHeight: 386 })}>
             {inputRows.map((row, index) => (
               <HStack key={`input-row-${index}`} alignment="center" spacing={6} modifiers={modifiers().frame({ maxWidth: 'infinity', height: 56 }).padding({ leading: 6, trailing: 6 }).background({ style: capB(colorScheme), shape: { type: "rect", cornerRadius: 14 } })}>
                  <Text font={18} fontWeight="bold" modifiers={modifiers().frame({ width: 30, height: 32, alignment: "center" }).foregroundStyle(lab(colorScheme))}>{index + 1}</Text>
                 <TextField title="" prompt="输入数字或文本" value={row} onChanged={(value: string) => updateInputRow(index, value)} modifiers={modifiers().frame({ maxWidth: 'infinity', height: 56 }).font(16).foregroundStyle(inputT(colorScheme))} />
                  {inputRows.length > 1 && (
                 <HStack spacing={4} modifiers={modifiers().padding({ leading: 2, trailing: 2 })}>
                    <Button action={() => { if (index > 0) { flashPressed(`up-${index}`); moveInputRow(index, -1) } }} modifiers={modifiers().frame({ width: 32, height: 32, alignment: "center" }).padding(0).font(18).fontWeight("bold").foregroundStyle(index === 0 ? sub(colorScheme) : (pressedKey === `up-${index}` ? "#1d4ed8" : "#3b82f6")).contentShape({ type: "rect", cornerRadius: 8 })}><Image systemName="chevron.up" renderingMode="template" /></Button>
                    <Button action={() => { if (index < inputRows.length - 1) { flashPressed(`down-${index}`); moveInputRow(index, 1) } }} modifiers={modifiers().frame({ width: 32, height: 32, alignment: "center" }).padding(0).font(18).fontWeight("bold").foregroundStyle(index === inputRows.length - 1 ? sub(colorScheme) : (pressedKey === `down-${index}` ? "#1d4ed8" : "#3b82f6")).contentShape({ type: "rect", cornerRadius: 8 })}><Image systemName="chevron.down" renderingMode="template" /></Button>
                   <HStack modifiers={modifiers().frame({ width: 30, height: 36, alignment: 'center' }).padding(0).foregroundStyle("#FF6B6B").contentShape({ type: "rect", cornerRadius: 8 }).onTapGesture(() => deleteInputRow(index)).onLongPressGesture({ minDuration: 500, perform: clearAllInputRows })}><Image systemName="trash" renderingMode="template" /></HStack>
                  </HStack>
                   )}
               </HStack>
             ))}
              </ScrollView>
              <HStack spacing={12} modifiers={modifiers().frame({ maxWidth: 'infinity' }).padding({ top: 6, bottom: 10 })}>
                <Button title="+添加一行" action={addInputRow} modifiers={modifiers().offset({ x: 38, y: 0 }).font(16).fontWeight("medium").foregroundStyle("#3b82f6")} />
                <Spacer />
                <Button action={scanInput} modifiers={modifiers().offset({ x: -38, y: 0 }).font(16).fontWeight("medium").foregroundStyle("#3b82f6")}><HStack spacing={5}><Image systemName="viewfinder" renderingMode="template" modifiers={modifiers().font(16)} /><Text font={16} fontWeight="medium">识别文字填充</Text></HStack></Button>
              </HStack>
           </VStack>
            <HStack alignment="center" spacing={10} modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 56, maxHeight: 56 }).padding({ leading: 16, trailing: 16 }).background({ style: cardB(colorScheme), shape: { type: "rect", cornerRadius: 16 } })}>
             <Text font={15} fontWeight="semibold" modifiers={modifiers().foregroundStyle(lab(colorScheme))}>条码类型</Text>
             <Spacer />
              <Picker label={<Text font={15} modifiers={modifiers().foregroundStyle("#3b82f6")}>{typeName(barcodeType)}</Text>} value={barcodeType} onChanged={(v: string) => setBarcodeType(v as BarcodeType)} pickerStyle="menu">
                {BARCODE_TYPES.map((t) => <Text tag={t.id}>{t.name}</Text>)}
              </Picker>
           </HStack>
           <Text font={12} modifiers={modifiers().frame({ maxWidth: "infinity", alignment: "leading" }).padding({ leading: 6, trailing: 6 }).foregroundStyle(sub(colorScheme))}>{barcodeTypeHint(barcodeType)}</Text>
           <Button action={() => { if (hasInput) generate() }} modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 56, maxHeight: 56, alignment: 'center' }).padding({ leading: 16, trailing: 16 }).font(18).fontWeight("bold").foregroundStyle(hasInput ? "#ffffff" : sub(colorScheme)).background({ style: hasInput ? "#3b82f6" : (colorScheme === "dark" ? "rgba(90,110,145,0.42)" : "rgba(59,130,246,0.14)"), shape: { type: "rect", cornerRadius: 16 } }).contentShape({ type: "rect", cornerRadius: 16 })}><HStack modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 56, maxHeight: 56, alignment: 'center' })}><Spacer /><Text font={18} fontWeight="bold">生成条码</Text><Spacer /></HStack></Button>
           {/* 每个输入框已经代表一条独立条码 */}
         </VStack>
                </ScrollView>
               </VStack>
            </FullScreenBg>
            </VStack>
              )}
              {activeTab === "favorites" && (
                <VStack spacing={0} modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" })}>
                <FavoritesPage
                  favorites={favorites}
                  colorScheme={settings.colorScheme}
                  settings={settings}
                  barcodeType={barcodeType}
                  buildItems={buildItems}
                  onFavorite={addFavorite}
                  onClose={() => selectHomeTab("generate")}
                  onRemove={removeFavorite}
                  onRenameFolder={renameFolder}
                  onCreateFolder={createFolder}
                  onDeleteFolder={deleteFolder}
                  onMoveFolder={moveFolder}
                  folders={folders}
                  onRenameFavorite={renameFavorite}
                  onMoveFavorite={moveFavorite}
                  onEdit={editFavorite}
                />
                </VStack>
              )}
              {activeTab === "history" && (
                <VStack spacing={0} modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" })}>
                <HistoryPage
                  history={history}
                  colorScheme={settings.colorScheme}
                  settings={settings}
                  favorites={favorites}
                  folders={folders}
                  barcodeType={barcodeType}
                  buildItems={buildItems}
                  onFavorite={addFavorite}
                  onCreateFolder={createFolder}
                  onClose={() => selectHomeTab("generate")}
                  onClear={clearHistory}
                />
                </VStack>
              )}
              {activeTab === "settings" && (
                <VStack spacing={0} modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" })}>
                <SettingsPage
                  settings={settings}
                  onChange={updateSettings}
                  onClose={() => selectHomeTab("generate")}
                />
                </VStack>
              )}
              </VStack>
              <HStack
                alignment="center"
                spacing={0}
                padding={{ top: 2, bottom: 8, leading: 4, trailing: 4 }}
                modifiers={modifiers()
                  .frame({ maxWidth: "infinity", alignment: "center" })
                  .background({ style: "regularMaterial" })}
              >
                {HOME_TABS.map((tab) => {
                  const title = tab === "generate" ? "生成" : tab === "favorites" ? "收藏" : tab === "history" ? "历史" : "设置"
                  const icon = tab === "generate" ? "barcode.viewfinder" : tab === "favorites" ? "heart" : tab === "history" ? "clock" : "gearshape"
                  const selected = selectedTab === tab
                  return (
                    <Button
                      key={`home-tab-${tab}`}
                      action={() => selectHomeTabFromBar(tab)}
                      buttonStyle="plain"
                      containerRelativeFrame={{
                        axes: "horizontal",
                        count: 4,
                        span: 1,
                        spacing: 0,
                        alignment: "center",
                      }}
                      contextMenu={tab === "generate" ? {
                        menuItems: (
                          <Group>
                            <Button title="识别文字填充" systemImage="viewfinder" action={() => { void scanFromGenerateTab() }} />
                          </Group>
                        ),
                      } : tab === "favorites" ? {
                        menuItems: (
                          <Group>
                            <Button title="导出备份" systemImage="square.and.arrow.up" action={() => { void exportBackup() }} />
                            <Button title="导入备份" systemImage="square.and.arrow.down" action={() => { void importBackup() }} />
                          </Group>
                        ),
                      } : tab === "history" ? {
                        menuItems: (
                          <Group>
                            <Button title="清空历史" systemImage="trash" role="destructive" action={() => { void clearHistory() }} />
                          </Group>
                        ),
                      } : undefined}
                      modifiers={modifiers()
                        .frame({ height: 60, alignment: "center" })
                        .padding(0)
                        .contentShape({ type: "rect", cornerRadius: 10 })}
                    >
                      <VStack alignment="center" spacing={3} modifiers={modifiers().frame({ maxWidth: "infinity", height: 58, alignment: "center" })}>
                        <Image systemName={icon} renderingMode="template" imageScale="large" modifiers={modifiers().font(23).foregroundStyle(selected ? "#3b82f6" : sub(colorScheme))} />
                        <Text font={11} fontWeight={selected ? "semibold" : "regular"} modifiers={modifiers().foregroundStyle(selected ? "#3b82f6" : sub(colorScheme))}>{title}</Text>
                      </VStack>
                    </Button>
                  )
                })}
              </HStack>
            </VStack>
          )
        }}
      </ScrollViewReader>
    </NavigationStack>
  )
}

export default View

async function run() {
  // 全屏显示：整个应用铺满手机屏幕，而非弹出式卡片
  await Navigation.present({
    element: <View />,
    modalPresentationStyle: "fullScreen",
  })
  Script.exit()
}

run()
