// 批量条码生成器 · Scripting 声明式 UI 版本
import {
  Script,
  Navigation,
  NavigationStack,
  ScrollView,
  ScrollViewReader,
  ScrollViewProxy,
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
  maxTextLength,
} from "./barcode_core"
import { HistoryItem, FavoriteItem, InterchangeBackup, createInterchangeBackup, parseInterchangeBackup, interchangeFoldersToPaths, joinFolder, loadHistory, saveHistory, loadFavorites, saveFavorites, loadFolders, saveFolders, loadSettings, saveSettings } from "./storage"
const HISTORY_KEY = "recent_history"
const HISTORY_MAX = 20
function makeRowId(): string { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
import { validateTexts as validateBarcodeTexts, collectNonEmptyTexts, isBarcodeItemValid } from "./validation"
import { CS, schemeProps, lab, sub, ter, cardB, capB, pageB, inputT, FullScreenBg } from "./theme"
import { SettingsPage } from "./SettingsPage"
import { BarcodesPage, PresentedBarcodes } from "./BarcodesPage"
import { HistoryPage } from "./HistoryPage"
import { FavoritesPage } from "./FavoritesPage"
import { InputPage } from "./InputPage"

// alert 是 Scripting 运行时提供的全局函数，类型检查器未收录，这里补充声明
// 以便消除误报（不影响运行时行为）
declare function alert(message: string): Promise<void>
declare const Dialog: any
declare const FileManager: any
declare const Data: any
declare const Keychain: any
declare function fetch(input: string, init?: any): Promise<any>
const GITHUB_TOKEN_KEY = "barcode_generator_github_token"
const GITHUB_USER_KEY = "barcode_generator_github_user"







async function pushProjectToGitHub(): Promise<void> {
  const dir = FileManager.scriptsDirectory + "/条码生成器"
  const descriptor = JSON.parse(FileManager.readAsStringSync(dir + "/script.json"))
  const remote = descriptor.remoteResource?.url?.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!remote) throw new Error("script.json 中没有有效的 GitHub 远程地址")
  let token = Keychain.get(GITHUB_TOKEN_KEY)
  let username = Keychain.get(GITHUB_USER_KEY) || "x-access-token"
  if (!token) {
    const entered = await Dialog.prompt("请输入 Personal Access Token（仅保存到 Keychain）", "Token")
    if (!entered) throw new Error("已取消 Token 输入")
    token = entered
    Keychain.set(GITHUB_TOKEN_KEY, token)
    Keychain.set(GITHUB_USER_KEY, username)
  }
  const headers = { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }
  const entries = await FileManager.readDirectory(dir, true)
  const files = entries.map((p: string) => p.startsWith("/") ? p : dir + "/" + p).filter((p: string) => FileManager.isFileSync(p)).map((p: string) => ({ absolute: p, path: p.slice((dir + "/").length) }))
  for (const file of files) {
    if (file.path.startsWith(".")) continue
    const api = `https://api.github.com/repos/${remote[1]}/${remote[2]}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`
    const current = await fetch(`${api}?ref=master`, { headers })
    const data = Data.fromRawString(FileManager.readAsStringSync(file.absolute))
    if (!data) throw new Error(`无法读取：${file.path}`)
    const body: any = { message: "Update barcode generator", content: data.toBase64String(), branch: "master" }
    if (current.ok) body.sha = (await current.json()).sha
    const response = await fetch(api, { method: "PUT", headers, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`)
  }
}

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
  // 是否打开样式设置页（使用 NavigationStack 全屏导航，不使用弹出式 modal）
  const [showSettings, setShowSettings] = useState(false)
  // 是否打开历史记录页
  const [showHistory, setShowHistory] = useState(false)
  // 是否打开收藏页
  const [showFavorites, setShowFavorites] = useState(false)
  const [favoritesViewVersion, setFavoritesViewVersion] = useState(0)
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

  // 相机扫描：每个识别结果独立成为一个输入框，追加到当前列表
  async function scanInput() {
    const texts = await scanTexts()
    if (texts === null) return
    setInputRows((prev) => [
      ...prev.filter((s) => s.trim().length > 0),
      ...texts,
    ].slice(0, MAX_BARCODE_ITEMS))
    if (texts.length > MAX_BARCODE_ITEMS) {
      await alert(`扫描结果超过 ${MAX_BARCODE_ITEMS} 条，已只保留前 ${MAX_BARCODE_ITEMS} 条`)
    }
  }

  // 小组件“扫描填充”入口：通过 run URL 启动脚本后自动打开扫描
  useEffect(() => {
    const action = Script.queryParameters?.action
    if (action === "scan") {
      // 运行 URL 已进入脚本后立即打开扫描，不再等待首页动画
      void scanInput()
    } else if (action === "favorites") {
      setTimeout(() => { setShowFavorites(true) }, 250)
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
  function validateTexts(texts: string[], type: BarcodeType): string | null {
    if (texts.length > MAX_BARCODE_ITEMS) return `一次最多生成 ${MAX_BARCODE_ITEMS} 条条码`
    const limit = maxTextLength(type)
    const tooLong = texts.findIndex((text) => {
      const value = ["ean13", "ean8", "upca", "itf14"].includes(type)
        ? text.replace(/\s/g, "")
        : text
      return value.length > limit
    })
    return tooLong >= 0 ? `第 ${tooLong + 1} 条内容过长：${typeName(type)}最多支持 ${limit} 个字符` : null
  }

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
  function clearHistory() {
    setHistory([])
    Storage.remove(HISTORY_KEY)
  }

  function editFavorite(texts: string[], type: BarcodeType) {
    setInputRows(texts.length > 0 ? [...texts] : [""])
    setBarcodeType(type)
    setForceUnfavorited(true)
    setShowFavorites(false)
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
  async function addFavorite(name: string, folder: string) {
    const texts = items.map((i) => i.text)
    const sameName = favorites.find((f) => f.name === name && (f.type ?? "code128") === barcodeType)
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
      { id: sameName?.id ?? makeRowId(), name, texts, type: barcodeType, time: Date.now(), folder },
      ...favorites.filter((f) => f.id !== sameName?.id),
    ]
    setFavorites(next)
    saveFavorites(next)
  }

  async function exportBackup() {
    try {
      const backup = createInterchangeBackup(favorites, folders)
      const content = JSON.stringify(backup, null, 2)
      const data = Data.fromRawString(content)
      if (!data) throw new Error("无法生成备份文件")
      await DocumentPicker.exportFiles({ files: [{ data, name: "barcode-generator-backup.json" }] })
      await alert("跨平台备份已导出")
    } catch (error) {
      await alert(`导出失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function importBackup() {
    const paths = await DocumentPicker.pickFiles()
    if (!paths || paths.length === 0) return
    try {
      const path = paths[0]
      if (typeof path !== "string" || !path.trim()) throw new Error("未选择有效的备份文件")
      if (!FileManager.existsSync(path) || !FileManager.isFileSync(path)) throw new Error("备份文件不存在或不是文件")
      if (FileManager.isFileStoredIniCloud(path) && !FileManager.isiCloudFileDownloaded(path)) {
        const downloaded = await FileManager.downloadFileFromiCloud(path)
        if (!downloaded) throw new Error("备份文件尚未下载完成")
      }
      const content = FileManager.readAsStringSync(path).replace(/^\uFEFF/, "").trim()
      if (!content) throw new Error("备份文件为空")
      const parsed = parseInterchangeBackup(JSON.parse(content))
      const importedFolders = interchangeFoldersToPaths(parsed)
      const usedIds = new Set(favorites.map((favorite) => favorite.id))
      const importedFavorites: FavoriteItem[] = parsed.favorites.map((favorite) => {
        let id = favorite.id || makeRowId()
        while (usedIds.has(id)) id = makeRowId()
        usedIds.add(id)
        return {
          id, name: favorite.name, texts: favorite.texts,
          type: favorite.type ?? "code128", time: favorite.time ?? Date.now(),
          folder: joinFolder(favorite.rootFolder, favorite.subFolder),
        }
      })
      const nextFavorites = [...favorites]
      let added = 0, replaced = 0, skipped = 0
      for (const item of importedFavorites) {
        const duplicate = nextFavorites.find((current) => current.name === item.name && (current.folder || "") === item.folder && (current.type ?? "code128") === item.type && current.texts.join("\\u0001") === item.texts.join("\\u0001"))
        if (duplicate) { skipped++; continue }
        const sameName = nextFavorites.find((current) => current.name === item.name && (current.folder || "") === item.folder && (current.type ?? "code128") === item.type)
        if (sameName) {
          const choice = await Dialog.actionSheet({ title: "发现同名收藏", message: `${item.folder || "未分类"}/${item.name}`, cancelButton: true, actions: [{ label: "保留原收藏" }, { label: "使用导入内容" }, { label: "两个都保留" }] })
          if (choice === null || choice === 0) { skipped++; continue }
          if (choice === 1) { nextFavorites.splice(nextFavorites.indexOf(sameName), 1); replaced++ }
          else added++
        } else added++
        nextFavorites.push(item)
      }
      const nextFolders = Array.from(new Set([...folders, ...importedFolders]))
      setFolders(nextFolders); saveFolders(nextFolders)
      setFavorites(nextFavorites); saveFavorites(nextFavorites)
      // 先显示结果对话框；关闭旧页面后重新打开，确保 navigationDestination 不再使用缓存数据
      await alert(`导入完成：新增 ${added} 条，替换 ${replaced} 条，跳过 ${skipped} 条`)
      setShowFavorites(false)
      setFavoritesViewVersion((version) => version + 1)
      setTimeout(() => setShowFavorites(true), 120)
    } catch (error) {
      await alert(`导入失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
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
      setFavorites(next)
      saveFavorites(next)
      return
    }
    const next = favorites.map((f) => f.id === id ? { ...f, name } : f)
    setFavorites(next)
    saveFavorites(next)
  }

  // 删除收藏
  function removeFavorite(id: string) {
    const next = favorites.filter((f) => f.id !== id)
    setFavorites(next)
    saveFavorites(next)
  }

  // 移动单条收藏到指定文件夹
  function moveFavorite(id: string, folder: string) {
    const source = favorites.find((f) => f.id === id)
    if (source && (folder === source.folder || folder.startsWith(`${source.folder}/`))) {
      void alert("不能将收藏移动到当前文件夹或其子文件夹")
      return
    }
    const next = favorites.map((f) => f.id === id ? { ...f, folder } : f)
    setFavorites(next)
    saveFavorites(next)
  }

  function createFolder(parentFolder: string, name: string) {
    const path = parentFolder ? `${parentFolder}/${name}` : name
    const next = Array.from(new Set([...folders, path]))
    setFolders(next)
    saveFolders(next)
  }

  function deleteFolder(folder: string) {
    const prefix = `${folder}/`
    const nextFolders = folders.filter((f) => f !== folder && !f.startsWith(prefix))
    const nextFavorites = favorites.filter((f) => {
      const current = f.folder || ""
      return current !== folder && !current.startsWith(prefix)
    })
    setFolders(Array.from(new Set(nextFolders)))
    saveFolders(nextFolders)
    setFavorites(nextFavorites)
    saveFavorites(nextFavorites)
  }

  function moveFolder(folder: string, parentFolder: string) {
    if (parentFolder === folder || parentFolder.startsWith(`${folder}/`)) {
      void alert("不能将文件夹移动到自身或子文件夹")
      return
    }
    const nextFolders = folders.map((f) => {
      if (f !== folder && !f.startsWith(`${folder}/`)) return f
      const suffix = f.slice(folder.length)
      return parentFolder ? `${parentFolder}${suffix}` : suffix.replace(/^\/+/, "")
    })
    const nextFavorites = favorites.map((f) => {
      const current = f.folder || ""
      if (current !== folder && !current.startsWith(`${folder}/`)) return f
      const suffix = current.slice(folder.length)
      return { ...f, folder: parentFolder ? `${parentFolder}${suffix}` : suffix.replace(/^\/+/, "") }
    })
    setFolders(Array.from(new Set(nextFolders)))
    saveFolders(nextFolders)
    setFavorites(nextFavorites)
    saveFavorites(nextFavorites)
  }

  function renameFolder(oldFolder: string, newFolder: string) {
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
    setFolders(nextFolders)
    saveFolders(nextFolders)
    setFavorites(next)
    saveFavorites(next)
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
                  onClose={() => setShowBarcodes(false)}
                  onFavorite={addFavorite}
                  forceUnfavorited={forceUnfavorited}
                  showCustomBack={false}
                />
              ),
            })
             .navigationDestination({
               isPresented: showSettings,
               onChanged: setShowSettings,
               content: (
                 <SettingsPage
                   settings={settings}
                   onChange={updateSettings}
                   onClose={() => setShowSettings(false)}
                 />
               ),
             })
             .navigationDestination({
               isPresented: showHistory,
              onChanged: setShowHistory,
              content: (
                <HistoryPage
                  history={history}
                  colorScheme={settings.colorScheme}
                  settings={settings}
                  favorites={favorites}
                  barcodeType={barcodeType}
                  buildItems={buildItems}
                  onFavorite={addFavorite}
                  onClose={() => setShowHistory(false)}
                  onClear={clearHistory}
                />
              ),
            })
            .navigationDestination({
              isPresented: showFavorites,
              onChanged: setShowFavorites,
              content: (
                <FavoritesPage
                  key={`favorites-${favoritesViewVersion}`}
                  favorites={favorites}
                  colorScheme={settings.colorScheme}
                  settings={settings}
                  barcodeType={barcodeType}
                  buildItems={buildItems}
                  onFavorite={addFavorite}
                  onClose={() => setShowFavorites(false)}
                  onRemove={removeFavorite}
                  onRenameFolder={renameFolder}
                   onCreateFolder={createFolder}
                   onDeleteFolder={deleteFolder}
                   onMoveFolder={moveFolder}
                   folders={folders}
                   onRenameFavorite={renameFavorite}
                  onMoveFavorite={moveFavorite}
                  onEdit={editFavorite}
                   onExportBackup={exportBackup}
                   onImportBackup={importBackup}
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
          {/* 单个多行输入框（扫描表格后自动换行） */}
                     {/* 逐行输入：扫描结果每条独立一行，可编辑、排序和删除 */}
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
                <Button action={scanInput} modifiers={modifiers().offset({ x: -38, y: 0 }).font(16).fontWeight("medium").foregroundStyle("#3b82f6")}><HStack spacing={5}><Image systemName="viewfinder" renderingMode="template" modifiers={modifiers().font(16)} /><Text font={16} fontWeight="medium">扫描填充</Text></HStack></Button>
              </HStack>
           </VStack>
            <HStack alignment="center" spacing={10} modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 56, maxHeight: 56 }).padding({ leading: 16, trailing: 16 }).background({ style: cardB(colorScheme), shape: { type: "rect", cornerRadius: 16 } })}>
             <Text font={15} fontWeight="semibold" modifiers={modifiers().foregroundStyle(lab(colorScheme))}>条码类型</Text>
             <Spacer />
              <Picker label={<Text font={15} modifiers={modifiers().foregroundStyle("#3b82f6")}>{typeName(barcodeType)}</Text>} value={barcodeType} onChanged={(v: string) => setBarcodeType(v as BarcodeType)} pickerStyle="menu">
                {BARCODE_TYPES.map((t) => <Text tag={t.id}>{t.name}</Text>)}
              </Picker>
           </HStack>
           <Button action={() => { if (hasInput) generate() }} modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 56, maxHeight: 56, alignment: 'center' }).padding({ leading: 16, trailing: 16 }).font(18).fontWeight("bold").foregroundStyle(hasInput ? "#ffffff" : sub(colorScheme)).background({ style: hasInput ? "#3b82f6" : (colorScheme === "dark" ? "rgba(90,110,145,0.42)" : "rgba(59,130,246,0.14)"), shape: { type: "rect", cornerRadius: 16 } }).contentShape({ type: "rect", cornerRadius: 16 })}><HStack modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 56, maxHeight: 56, alignment: 'center' })}><Spacer /><Text font={18} fontWeight="bold">生成条码</Text><Spacer /></HStack></Button>
           {/* 每个输入框已经代表一条独立条码 */}
         </VStack>
                </ScrollView>
                <HStack spacing={6} modifiers={modifiers().frame({ maxWidth: 'infinity' }).padding({ top: 10, bottom: 10, leading: 12, trailing: 12 }).background({ style: colorScheme === "system" ? "regularMaterial" : colorScheme === "dark" ? "rgba(17,19,25,0.96)" : "rgba(248,249,252,0.72)", shape: { type: "rect", cornerRadius: 26 } }).overlay({ alignment: "center", content: <RoundedRectangle cornerRadius={26} stroke={{ shapeStyle: colorScheme === "system" ? "separator" : colorScheme === "dark" ? "rgba(72,80,96,0.58)" : "rgba(153,163,180,0.62)", strokeStyle: { lineWidth: 1 } }} /> }).padding({ leading: 14, trailing: 14, bottom: 12 })}>
                  <Button action={() => { flashPressed("tab-favorites"); setShowFavorites(true) }} modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 48 }).padding(0).foregroundStyle(pressedKey === "tab-favorites" ? "#1d4ed8" : (colorScheme === "dark" ? "#f4f7ff" : colorScheme === "system" ? "label" : "#334155"))}>
                    <VStack alignment="center" spacing={3} modifiers={modifiers().padding({ top: 6, bottom: 6, leading: 25, trailing: 25 }).background({ style: colorScheme === "system" ? "ultraThinMaterial" : colorScheme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.22)", shape: { type: "rect", cornerRadius: 14 } }).overlay({ alignment: "center", content: <RoundedRectangle cornerRadius={14} stroke={{ shapeStyle: colorScheme === "system" ? "tertiaryLabel" : colorScheme === "dark" ? "rgba(150,160,180,0.32)" : "rgba(170,180,195,0.30)", strokeStyle: { lineWidth: 1 } }} /> })}>
                      <Image systemName="heart" renderingMode="template" modifiers={modifiers().font(18)} />
                      <Text font={11} fontWeight="medium">收藏</Text>
                    </VStack>
                  </Button>
                  <Button action={() => { flashPressed("tab-history"); setShowHistory(true) }} modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 48 }).padding(0).foregroundStyle(pressedKey === "tab-history" ? "#1d4ed8" : (colorScheme === "dark" ? "#f4f7ff" : colorScheme === "system" ? "label" : "#334155"))}>
                    <VStack alignment="center" spacing={3} modifiers={modifiers().padding({ top: 6, bottom: 6, leading: 25, trailing: 25 }).background({ style: colorScheme === "system" ? "ultraThinMaterial" : colorScheme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.22)", shape: { type: "rect", cornerRadius: 14 } }).overlay({ alignment: "center", content: <RoundedRectangle cornerRadius={14} stroke={{ shapeStyle: colorScheme === "system" ? "tertiaryLabel" : colorScheme === "dark" ? "rgba(150,160,180,0.32)" : "rgba(170,180,195,0.30)", strokeStyle: { lineWidth: 1 } }} /> })}>
                      <Image systemName="clock" renderingMode="template" modifiers={modifiers().font(18)} />
                      <Text font={11} fontWeight="medium">历史</Text>
                    </VStack>
                  </Button>
                   <Button action={() => { flashPressed("tab-settings"); setShowSettings(true) }} modifiers={modifiers().frame({ maxWidth: 'infinity', minHeight: 48 }).padding(0).foregroundStyle(pressedKey === "tab-settings" ? "#1d4ed8" : (colorScheme === "dark" ? "#f4f7ff" : colorScheme === "system" ? "label" : "#334155"))}>
                     <VStack alignment="center" spacing={3} modifiers={modifiers().padding({ top: 6, bottom: 6, leading: 25, trailing: 25 }).background({ style: colorScheme === "system" ? "ultraThinMaterial" : colorScheme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.22)", shape: { type: "rect", cornerRadius: 14 } }).overlay({ alignment: "center", content: <RoundedRectangle cornerRadius={14} stroke={{ shapeStyle: colorScheme === "system" ? "tertiaryLabel" : colorScheme === "dark" ? "rgba(150,160,180,0.32)" : "rgba(170,180,195,0.30)", strokeStyle: { lineWidth: 1 } }} /> })}>
                       <Image systemName="gearshape" renderingMode="template" modifiers={modifiers().font(18)} />
                       <Text font={11} fontWeight="medium">设置</Text>
                     </VStack>
                   </Button>
                </HStack>
               </VStack>
            </FullScreenBg>
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
