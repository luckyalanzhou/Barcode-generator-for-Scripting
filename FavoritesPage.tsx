import { Navigation, ScrollView, VStack, HStack, Text, Spacer, Button, Image, TextField, modifiers, useState } from "scripting"
import { BarcodeItem, BarcodeType, StyleSettings } from "./barcode_core"
import { FavoriteItem } from "./storage"
declare function alert(message: string): Promise<void>
declare const Dialog: any
import { PresentedBarcodes } from "./BarcodesPage"
import { CS, schemeProps, lab, sub, ter, cardB, inputT, FullScreenBg } from "./theme"

function formatFavoriteTime(time: number | undefined): string {
  if (typeof time !== "number" || !Number.isFinite(time)) return ""
  const d = new Date(time), now = new Date(), pad = (n: number) => String(n).padStart(2, "0")
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate() ? hm : `${d.getMonth()+1}/${d.getDate()} ${hm}`
}
// 收藏页：底部「收藏」Tab 打开，展示收藏列表（搜索 + 文件夹分组）；点击名称进入条码页，右侧垃圾桶删除
export function FavoritesPage({
  favorites,
  colorScheme,
  settings,
  barcodeType,
  buildItems,
  onFavorite,
  onClose,
  onRemove,
  onRenameFolder,
  onCreateFolder,
  onDeleteFolder,
  onMoveFolder,
  folders,
  onRenameFavorite,
  onMoveFavorite,
  onEdit,
  onExportBackup,
  onImportBackup,
}: {
  favorites: FavoriteItem[]
  colorScheme: "system" | "light" | "dark"
  settings: StyleSettings
  barcodeType: BarcodeType
  buildItems: (texts: string[], type: BarcodeType) => Promise<BarcodeItem[]>
  onFavorite: (name: string, folder: string) => void
  onClose: () => void
  onRemove: (id: string) => void
  onRenameFolder: (oldFolder: string, newFolder: string) => void
  onCreateFolder: (parentFolder: string, name: string) => void
  onDeleteFolder: (folder: string) => void
  onMoveFolder: (folder: string, parentFolder: string) => void
  folders: string[]
  onRenameFavorite: (id: string, name: string) => void
  onMoveFavorite: (id: string, folder: string) => void
  onEdit: (texts: string[], type: BarcodeType) => void
  onExportBackup: () => void
  onImportBackup: () => void
}) {
  // 收藏搜索关键字（空表示不筛选）；页面级状态，关闭时重置
  const [favoriteQuery, setFavoriteQuery] = useState("")
  // 默认折叠所有已有文件夹，用户可点击箭头展开
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set([
      ...folders,
      ...favorites.map((f) => f.folder || ""),
    ].filter((folder) => folder.length > 0))
  )
  function toggleFolder(folder: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }
  // 重命名文件夹：弹窗输入新文件夹名；未分类("")重命名会把未分类收藏归入该文件夹
  async function editFolder(folder: string) {
    const isUncat = folder === ""
    const newName = await Dialog.prompt({
      title: "重命名文件夹",
      message: isUncat
        ? "把「未分类」的收藏归入新文件夹"
        : `将文件夹「${folder}」重命名为`,
      defaultValue: isUncat ? "" : folder,
      placeholder: "新文件夹名称",
      confirmLabel: "保存",
      cancelLabel: "取消",
    })
    if (newName === null) return
    const trimmed = newName.trim()
    if (trimmed.length === 0) {
      alert("文件夹名称不能为空")
      return
    }
    if (!isUncat && trimmed === folder) return // 名称未变化
    onRenameFolder(folder, trimmed)
  }
  async function createSubfolder(folder: string) {
    const name = await Dialog.prompt({
      title: folder ? `在「${folder}」下新建文件夹` : "新建文件夹",
      message: "请输入文件夹名称",
      placeholder: "文件夹名称",
      confirmLabel: "创建",
      cancelLabel: "取消",
    })
    if (name === null) return
    const trimmed = name.trim().replace(/[\\/]+/g, "")
    if (trimmed.length === 0) {
      alert("文件夹名称不能为空")
      return
    }
    onCreateFolder(folder, trimmed)
  }

  async function deleteFolder(folder: string) {
    if (!folder) return
    const confirm = await Dialog.actionSheet({
      title: `删除「${folder}」`,
      message: `其中包含 ${favorites.filter((f) => (f.folder || "") === folder || (f.folder || "").startsWith(`${folder}/`)).length} 条收藏，删除后将无法恢复。确定继续吗？`,
      cancelButton: true,
      actions: [{ label: "删除文件夹", destructive: true }],
    })
    if (confirm === 0) onDeleteFolder(folder)
  }

  async function moveFolder(folder: string) {
    if (!folder) return
    const candidates = ["根目录", ...folders.filter((target) =>
      target !== folder && !target.startsWith(`${folder}/`)
    )]
    const choice = await Dialog.actionSheet({
      title: `移动「${folder}」`,
      message: "请选择目标文件夹",
      cancelButton: true,
      actions: candidates.map((target) => ({ label: target })),
    })
    if (choice === null || choice === undefined) return
    onMoveFolder(folder, candidates[choice] === "根目录" ? "" : candidates[choice])
  }

  async function showFolderMenu(folder: string) {
    const isPrimary = folder.split("/").length === 1
    const choice = await Dialog.actionSheet({
      title: folder || "未分类",
      cancelButton: true,
      actions: isPrimary
        ? [{ label: "新建文件夹" }, { label: "重命名" }, { label: "删除文件夹", destructive: true }]
        : [{ label: "重命名" }, { label: "删除文件夹", destructive: true }],
    })
    if (choice === null || choice === undefined) return
    if (isPrimary && choice === 0) await createSubfolder(folder)
    else if ((isPrimary ? choice === 1 : choice === 0) && folder) await editFolder(folder)
    else if ((isPrimary ? choice === 2 : choice === 1) && folder) await deleteFolder(folder)
  }

  // 编辑收藏名称
  async function editFavoriteName(fav: FavoriteItem) {
    const newName = await Dialog.prompt({
      title: "编辑收藏名称",
      message: "请输入新的收藏名称",
      defaultValue: fav.name,
      placeholder: "收藏名称",
      confirmLabel: "保存",
      cancelLabel: "取消",
    })
    if (newName === null) return
    const trimmed = newName.trim()
    if (trimmed.length === 0) {
      alert("收藏名称不能为空")
      return
    }
    if (trimmed === fav.name) return
    onRenameFavorite(fav.id, trimmed)
  }

  async function chooseMoveFolder(currentFolder: string): Promise<string | null> {
    const allFolders = Array.from(new Set([
      ...folders,
      ...favorites.map((f) => f.folder || ""),
    ].flatMap((folder) => {
      if (!folder) return []
      const parts = folder.split("/")
      return parts.map((_, index) => parts.slice(0, index + 1).join("/"))
    })))
    const safeFolders = allFolders.filter((folder) => folder !== currentFolder && !folder.startsWith(`${currentFolder}/`))
    async function chooseLevel(parent: string): Promise<string | null> {
      const children = safeFolders.filter((folder) => {
        const parts = folder.split("/")
        return parts.length === (parent ? parent.split("/").length + 1 : 1) &&
          (parent ? folder.startsWith(`${parent}/`) : true)
      }).sort()
      const labels = parent ? ["移动到此文件夹", ...children.map((f) => f.split("/").pop() || f), "返回"] : [...children.map((f) => f.split("/").pop() || f), "添加文件夹"]
      const choice = await Dialog.actionSheet({ title: parent || "选择目标文件夹", cancelButton: true, actions: labels.map((label) => ({ label })) })
      if (choice === null || choice === undefined) return null
      if (parent && choice === 0) return parent
      if (labels[choice] === "返回") return null
      
      if (!parent && labels[choice] === "添加文件夹") return "__create__"
      const selected = children[parent ? choice - 1 : choice]
      if (!selected) return null
      const selectedDepth = selected.split("/").length
       const hasChildren = safeFolders.some((folder) => folder.startsWith(`${selected}/`) && folder.split("/").length === selectedDepth + 1)
       return hasChildren ? ((await chooseLevel(selected)) ?? null) : selected
    }
    return chooseLevel("")
  }

  async function showFavoriteMenu(fav: FavoriteItem) {
    const choice = await Dialog.actionSheet({
      title: fav.name,
      cancelButton: true,
      actions: [
        { label: "编辑" },
        { label: "移动文件夹" },
        { label: "删除", destructive: true },
      ],
    })
    if (choice === 0) {
      await editFavoriteName(fav)
      return
    }
    if (choice === 1) {
      const selected = await chooseMoveFolder(fav.folder || "")
      if (selected === null) return
      if (selected === "__create__") {
        const newFolder = await Dialog.prompt({
          title: "添加文件夹",
          message: "请输入新的文件夹名称",
          placeholder: "文件夹名称",
          confirmLabel: "保存",
          cancelLabel: "取消",
        })
        if (newFolder === null) return
        const trimmed = newFolder.trim().replace(/[\\/]+/g, "")
        if (trimmed.length === 0) {
          alert("文件夹名称不能为空")
          return
        }
        onMoveFavorite(fav.id, trimmed)
      } else {
        onMoveFavorite(fav.id, selected)
      }
      return
    }
    if (choice === 2) {
      const confirm = await Dialog.actionSheet({
        title: "删除收藏",
        message: `确定删除「${fav.name}」吗？`,
        cancelButton: true,
        actions: [{ label: "删除", destructive: true }],
      })
      if (confirm === 0) onRemove(fav.id)
    }
  }


  const folderNames = Array.from(new Set(folders.filter((f) => f.trim().length > 0)))

  const filteredFavorites = favoriteQuery.trim().length === 0
    ? favorites
    : favorites.filter((f) => {
        const q = favoriteQuery.trim().toLowerCase()
        return (
          f.name.toLowerCase().includes(q) ||
          (f.folder || "").toLowerCase().includes(q) ||
          f.texts.some((t) => t.toLowerCase().includes(q))
        )
      })

  const allFolderNames = Array.from(new Set([...folderNames, ...filteredFavorites.map((f) => f.folder || "")]))
  const visibleFolderSet = new Set<string>([""])
  allFolderNames.filter((f) => f !== "").forEach((folder) => {
    const parts = folder.split("/")
    parts.forEach((_, index) => visibleFolderSet.add(parts.slice(0, index + 1).join("/")))
  })
  const visibleFolders = Array.from(visibleFolderSet)
  const childFolders = (parent: string) => visibleFolders.filter((folder) => {
    if (!parent || !folder) return false
    const parts = folder.split("/")
    return parts.length === parent.split("/").length + 1 && folder.startsWith(`${parent}/`)
  }).sort()
  function isFolderCollapsed(folder: string): boolean {
    if (favoriteQuery.trim().length > 0) {
      const q = favoriteQuery.trim().toLowerCase()
      const folderMatches = folder.toLowerCase().includes(q)
      const hasMatchingItem = filteredFavorites.some((fav) => {
        const path = fav.folder || ""
        return path === folder || path.startsWith(`${folder}/`)
      })
      if (folderMatches || hasMatchingItem) return false
    }
    return collapsedFolders.has(folder)
  }

  function isFolderSearchMatch(folder: string): boolean {
    const q = favoriteQuery.trim().toLowerCase()
    return q.length > 0 && folder.toLowerCase().includes(q)
  }
  function isFavoriteSearchMatch(fav: FavoriteItem): boolean {
    const q = favoriteQuery.trim().toLowerCase()
    return q.length > 0 && (
      fav.name.toLowerCase().includes(q) ||
      (fav.folder || "").toLowerCase().includes(q) ||
      fav.texts.some((text) => text.toLowerCase().includes(q))
    )
  }

  const renderFolder = (folder: string, depth: number): any => {
    const groupItems = filteredFavorites.filter((f) => (f.folder || "") === folder)
    const children = childFolders(folder)
    const displayName = folder ? folder.split("/").pop() || folder : "未分类"
    return (
      <VStack key={folder || "__uncategorized"} alignment="center" spacing={6} modifiers={modifiers().padding({ leading: depth * 14 })}>
        <HStack alignment="center" spacing={depth === 0 ? 8 : 6} modifiers={modifiers().frame({ maxWidth: 'infinity', height: depth === 0 ? 52 : 44, alignment: 'center' }).padding(2).background({ style: isFolderSearchMatch(folder) ? "rgba(250, 204, 21, 0.20)" : "clear", shape: { type: "rect", cornerRadius: 12 } })}>
          <Button action={() => toggleFolder(folder)} modifiers={modifiers().frame({ maxWidth: 'infinity' })}>
            <HStack alignment="center" spacing={depth === 0 ? 8 : 6}><Image systemName={folder === "" ? "folder" : "folder.fill"} renderingMode="template" modifiers={modifiers().font(depth === 0 ? 20 : 18).foregroundStyle(sub(colorScheme))} /><Text font={depth === 0 ? 16 : 14} fontWeight="semibold" modifiers={modifiers().foregroundStyle(depth === 0 ? "#3b82f6" : "#8b5cf6")}>{displayName}</Text><Spacer /><Text font={12} modifiers={modifiers().foregroundStyle(sub(colorScheme))}>{depth === 0 ? (groupItems.length > 0 ? `${groupItems.length}项${children.length > 0 ? ` · ${children.length}个文件夹` : ""}` : children.length > 0 ? `${children.length}个文件夹` : "") : `${groupItems.length}项`}</Text><Image systemName={isFolderCollapsed(folder) ? "chevron.right" : "chevron.down"} renderingMode="template" modifiers={modifiers().font(depth === 0 ? 20 : 18).foregroundStyle(ter(colorScheme))} /></HStack>
          </Button>
          {folder !== "" ? <Button action={() => showFolderMenu(folder)} modifiers={modifiers().frame({ width: 44, height: 44, alignment: 'center' }).padding(0).font(18).foregroundStyle(sub(colorScheme)).contentShape({ type: "rect", cornerRadius: 16 })}><Image systemName="ellipsis.circle" renderingMode="template" /></Button> : null}
        </HStack>
        {!isFolderCollapsed(folder) && <>{groupItems.map((fav) => <HStack key={fav.id} alignment="center" spacing={8} modifiers={modifiers().frame({ maxWidth: 'infinity', height: 36, alignment: 'center' }).padding({ top: 4, bottom: 4, leading: 8, trailing: 8 }).background({ style: isFavoriteSearchMatch(fav) ? "rgba(250, 204, 21, 0.24)" : cardB(colorScheme), shape: { type: "rect", cornerRadius: 16 } })}><Button action={() => selectFavorite(fav)} modifiers={modifiers().frame({ maxWidth: 'infinity' })}><Text font={16} fontWeight="bold" modifiers={modifiers().foregroundStyle(lab(colorScheme)).frame({ maxWidth: 'infinity', alignment: 'leading' })}>{fav.name}</Text></Button>{typeof fav.time === "number" && Number.isFinite(fav.time) && <Text font={11} modifiers={modifiers().lineLimit(1).foregroundStyle(sub(colorScheme))}>{formatFavoriteTime(fav.time)}</Text>}<Button action={() => showFavoriteMenu(fav)} modifiers={modifiers().frame({ width: 36, height: 36, alignment: 'center' }).padding(0).font(17).foregroundStyle(sub(colorScheme)).contentShape({ type: "rect", cornerRadius: 12 })}><Image systemName="ellipsis" renderingMode="template" /></Button></HStack>)}{children.map((child) => renderFolder(child, depth + 1))}</>}
      </VStack>
    )
  }
  const rootFolders = visibleFolders.filter((folder) =>
    folder ? !folder.includes("/") : filteredFavorites.some((fav) => !(fav.folder || ""))
  )

  // 点击收藏：以新页面呈现条码页（不在收藏页内替换），返回键直接退回收藏列表
  async function selectFavorite(fav: FavoriteItem) {
    const barcodeItems = await buildItems(fav.texts, fav.type)
    await Navigation.present({
      element: (
        <PresentedBarcodes
          items={barcodeItems}
          settings={settings}
          favorites={favorites}
           onFavorite={onFavorite}
           onUnfavorite={() => onRemove(fav.id)}
           onEdit={() => onEdit(fav.texts, fav.type)}
        />
      ),
      modalPresentationStyle: "fullScreen",
    })
  }

  return (
    <FullScreenBg cs={colorScheme}>
    <ScrollView
      {...schemeProps(colorScheme)} modifiers={modifiers()
        .frame({ maxWidth: 'infinity', maxHeight: 'infinity' })
        .navigationTitle("收藏")
        .navigationBarTitleDisplayMode("inline")}
    >
      <VStack alignment="center" spacing={8} padding={16}>
         <HStack spacing={10} modifiers={modifiers().frame({ maxWidth: 'infinity' })}>
           <Button title="导出备份" action={onExportBackup} />
           <Button title="导入备份" action={onImportBackup} />
         </HStack>
        {favorites.length === 0 ? (
          <Text
            font={16}
            modifiers={modifiers()
              .foregroundStyle(sub(colorScheme))
              .padding({ top: 60 })}
          >
            暂无收藏
          </Text>
        ) : (
          <>
            {/* 收藏搜索框：按名称/文件夹/内容过滤 */}
            <HStack
              alignment="center"
              spacing={8}
              modifiers={modifiers()
                .frame({ maxWidth: 'infinity', height: 56, alignment: 'center' })
                .padding({ leading: 8, trailing: 8 })
                .background({
                  style: cardB(colorScheme),
                  shape: { type: "rect", cornerRadius: 16 },
                })}
            >
              <Image
                systemName="magnifyingglass"
                renderingMode="template"
                modifiers={modifiers().foregroundStyle(sub(colorScheme))}
              />
              <TextField
                title="搜索收藏"
                prompt="搜索名称、文件夹或内容"
                value={favoriteQuery}
                onChanged={setFavoriteQuery}
                submitLabel="search"
                onSubmit={() => Keyboard.hide()}
                modifiers={modifiers()
                  .frame({ maxWidth: 'infinity', height: 40, alignment: 'center' })
                  .font(16)
                  .foregroundStyle(inputT(colorScheme))
                  .padding(4)}
              />
              {favoriteQuery.length > 0 && (
                <Button
                  title="✕"
                  action={() => setFavoriteQuery("")}
                  modifiers={modifiers()
                    .frame({ width: 28, height: 28, alignment: 'center' })
                    .padding(0)
                    .font(14)
                    .foregroundStyle(sub(colorScheme))
                    .background({
                      style: "rgba(128, 128, 128, 0.25)",
                      shape: "circle",
                    })}
                />
              )}
            </HStack>
            {filteredFavorites.length === 0 ? (
              <Text
                font={14}
                modifiers={modifiers().foregroundStyle(sub(colorScheme))}
              >
                没有匹配的收藏
              </Text>
            ) : (
              rootFolders.map((folder) => renderFolder(folder, 0))
            )}
          </>
        )}
      </VStack>
    </ScrollView>
    </FullScreenBg>
  )
}
