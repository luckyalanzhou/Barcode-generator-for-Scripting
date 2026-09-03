import { Navigation, ScrollView, VStack, HStack, Text, Spacer, Button, Image, ZStack, modifiers, ImageRenderer, useState } from "scripting"
import { BarcodeCanvas, BarcodeItem, typeName, StyleSettings } from "./barcode_core"
import { FavoriteItem } from "./storage"
import { HistoryItem } from "./storage"
declare function alert(message: string): Promise<void>
declare const Dialog: any
import { CS, schemeProps, lab, sub, FullScreenBg } from "./theme"
// 新页面：展示生成的条形码（普通页面跳转，非弹出页）
export function BarcodesPage({
  items,
  settings,
  favorites,
  onClose,
  onFavorite,
  onUnfavorite,
  onEdit,
  forceUnfavorited = false,
  showCustomBack = true,
}: {
  items: BarcodeItem[]
  settings: StyleSettings
  favorites: FavoriteItem[]
  onClose: () => void
  onFavorite: (name: string, folder: string) => void
  onUnfavorite?: () => void
  onEdit?: () => void
  forceUnfavorited?: boolean
  showCustomBack?: boolean
}) {
  const colorScheme = settings.colorScheme
  const [isSaving, setIsSaving] = useState(false)
  // 记录刚被点击的返回键，用于“点击变浅紫”效果
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  // 收藏按钮始终用于新增收藏：即使条码内容相同，也允许保存为独立条目
  const isFavorited = false

  function flashPressed(key: string) {
    setPressedKey(key)
    setTimeout(() => setPressedKey(null), 300)
  }

  // 判断条码是否生成成功（一维看 bits，二维码看 qrImage）
  function itemOk(item: BarcodeItem): boolean {
    return item.type === "qr" ? item.qrImage != null : item.bits !== null
  }

  // 渲染单个条码主体：二维码用原生图片（qrSize 指定时按该尺寸居中缩放显示，否则用原始分辨率），一维用 Canvas
  function renderItemContent(item: BarcodeItem, qrSize?: number) {
    if (item.type === "qr") {
      if (item.qrImage == null) {
        return (
          <Text modifiers={modifiers().foregroundStyle("red")}>
            二维码生成失败
          </Text>
        )
      }
      const m =
        qrSize != null
          ? modifiers()
              .frame({ width: qrSize, height: qrSize, alignment: 'center' })
              .aspectRatio({ value: 1, contentMode: "fit" })
          : modifiers()
      return <Image image={item.qrImage} resizable={true} modifiers={m} />
    }
    if (item.bits === null) {
      return (
        <Text modifiers={modifiers().foregroundStyle("red")}>
          无法生成：内容格式或校验位错误
        </Text>
      )
    }
    return (
      <BarcodeCanvas
        bits={item.bits}
        barW={settings.barWidth}
        barH={settings.barHeight}
        quiet={10}
        barColor={settings.barColor}
        bgColor={settings.bgColor}
      />
    )
  }

  // 按设置渲染条码下方的内容文字
  function renderText(item: BarcodeItem, textColor?: any) {
    if (!settings.showText || !itemOk(item)) return null
    return (
      <Text font={settings.textSize} modifiers={modifiers().foregroundStyle(textColor ?? lab(colorScheme))}>
        {item.text}
      </Text>
    )
  }

  async function collectFavorite() {
    const folderPaths = Array.from(new Set(favorites.flatMap((fav) => {
      const parts = (fav.folder || "").split("/").filter(Boolean)
      return parts.map((_, index) => parts.slice(0, index + 1).join("/"))
    })))
    async function createFolder(parent: string): Promise<string | null> {
      const name = await Dialog.prompt({
        title: parent ? `在「${parent}」中新建文件夹` : "新建文件夹",
        message: "请输入文件夹名称",
        placeholder: "文件夹名称",
        confirmLabel: "下一步",
        cancelLabel: "取消",
      })
      if (name === null) return null
      const trimmed = name.trim().replace(/[\\/]+/g, "")
      if (!trimmed) {
        alert("文件夹名称不能为空")
        return null
      }
      return parent ? `${parent}/${trimmed}` : trimmed
    }
    async function chooseFolder(parent: string): Promise<string | null> {
      const children = folderPaths.filter((path) => {
        const depth = path.split("/").length
        return depth === (parent ? parent.split("/").length + 1 : 1) &&
          (parent ? path.startsWith(`${parent}/`) : true)
      }).sort()
      const labels = parent
        ? ["选择此文件夹", ...children.map((path) => path.split("/").pop() || path), "新建文件夹", "返回"]
        : [...children.map((path) => path.split("/").pop() || path), "新建文件夹"]
      const choice = await Dialog.actionSheet({
        title: parent || "选择文件夹",
        message: parent ? "可选择当前文件夹，或进入二级文件夹" : "请选择一级文件夹",
        cancelButton: true,
        actions: labels.map((label) => ({ label })),
      })
      if (choice === null || choice === undefined) return null
      if (parent && choice === 0) return parent
      if (parent && labels[choice] === "新建文件夹") return createFolder(parent)
      if (parent && labels[choice] === "返回") return null
      
      if (!parent && labels[choice] === "新建文件夹") return createFolder("")
      const selected = children[parent ? choice - 1 : choice]
      if (!selected) return null
      const hasChildren = folderPaths.some((path) => path.startsWith(`${selected}/`) && path.split("/").length === selected.split("/").length + 1)
      return hasChildren ? chooseFolder(selected) : selected
    }
    const folder = await chooseFolder("")
    if (folder === null) return
    await promptFavoriteName(folder)
  }

  async function promptFavoriteName(folder: string) {
    const name = await Dialog.prompt({
      title: "添加收藏",
      message: "请输入收藏名称",
      defaultValue: "",
      placeholder: "收藏名称",
      confirmLabel: "保存",
      cancelLabel: "取消",
    })
    if (name === null) return
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      alert("收藏名称不能为空")
      return
    }
    onFavorite(trimmedName, folder)
  }

  async function shareImage() {
    setIsSaving(true)
    try {
      const element = (
        <VStack alignment="center" spacing={settings.margin} padding={20}>
          {items.map((item) => (
            <VStack alignment="center" spacing={6}>
              {settings.textPosition === "top" && renderText(item, "#111111")}
              {renderItemContent(item)}
              {settings.textPosition === "bottom" && renderText(item, "#111111")}
            </VStack>
          ))}
        </VStack>
      )
      const data = await ImageRenderer.toPNGData(element)
      const image = UIImage.fromData(data)
      if (image === null) {
        alert("生成分享图片失败")
        return
      }
      await ShareSheet.present([image])
    } catch (e) {
      alert("分享失败：" + String(e))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <FullScreenBg cs={colorScheme}>
    <ZStack modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" })}>
    <ScrollView
             {...schemeProps(colorScheme)} modifiers={modifiers()
         .frame({ maxWidth: 'infinity', maxHeight: 'infinity' })
         .navigationTitle("条码")
         .navigationBarTitleDisplayMode("inline")
         .safeAreaInset({
           top: {
             alignment: 'leading',
             spacing: 0,
             content: (
               <HStack modifiers={modifiers().frame({ maxWidth: 'infinity', height: 48, alignment: 'center' }).padding({ leading: 12, trailing: 12 })}>
                 {showCustomBack && (
                   <Button action={() => { flashPressed("back"); onClose() }} modifiers={modifiers().frame({ width: 48, height: 48, alignment: 'center' }).padding(0).font(24).fontWeight("bold").foregroundStyle(pressedKey === "back" ? lab(colorScheme) : sub(colorScheme)).contentShape({ type: "rect", cornerRadius: 14 })}>
                     <Image systemName="chevron.up" renderingMode="template" />
                   </Button>
                 )}
                 <Spacer />
                 {onEdit && (
                   <Button action={() => { flashPressed("edit"); onEdit() }} modifiers={modifiers().frame({ width: 48, height: 48, alignment: 'center' }).padding(0).font(22).fontWeight("bold").foregroundStyle(pressedKey === "edit" ? "#1e40af" : "#3b82f6").contentShape({ type: "rect", cornerRadius: 14 })}>
                     <Image systemName="pencil" renderingMode="template" />
                   </Button>
                 )}
                 <Button action={collectFavorite} modifiers={modifiers().frame({ width: 48, height: 48, alignment: 'center' }).padding(0).font(24).fontWeight("bold").foregroundStyle(pressedKey === "fav" ? "#D97706" : "#F59E0B").contentShape({ type: "rect", cornerRadius: 14 })}>
                   <Image systemName={isFavorited ? "star.fill" : "star"} renderingMode="template" />
                 </Button>
                 <Button action={() => { flashPressed("share"); shareImage() }} modifiers={modifiers().frame({ width: 48, height: 48, alignment: 'center' }).padding(0).font(24).fontWeight("bold").foregroundStyle(pressedKey === "share" ? "#1e40af" : "#3b82f6").contentShape({ type: "rect", cornerRadius: 14 })}>
                   <Image systemName="square.and.arrow.up" renderingMode="template" />
                 </Button>
               </HStack>
             ),
           },
         })}
     >
                        <VStack
          alignment="center"
          spacing={16}
          padding={16}
        >
          <VStack
            alignment="center"
            spacing={settings.margin}
            modifiers={modifiers().frame({ maxWidth: 'infinity' })}
          >
            {items.map((item) => (
              <VStack alignment="center" spacing={6}>
                {settings.textPosition === "top" && renderText(item)}
                {renderItemContent(item, Math.min(Device.screen.width - 40, 300))}
                {settings.textPosition === "bottom" && renderText(item)}
                {itemOk(item) && settings.showFormat && (
                  <Text
                    font={12}
                    modifiers={modifiers().foregroundStyle(sub(colorScheme))}
                  >
                    {typeName(item.type)}
                  </Text>
                )}
              </VStack>
            ))}
          </VStack>
        </VStack>
    </ScrollView>
    </ZStack>
    </FullScreenBg>
  )
}

// 历史时间格式化：今天显示 HH:mm，否则 MM/DD HH:mm（模块级，供 HistoryPage 使用）
function formatHistoryTime(time: number): string {
  const d = new Date(time)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return hm
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function formatFavoriteTime(time: number | undefined): string {
  return typeof time === "number" && Number.isFinite(time)
    ? formatHistoryTime(time)
    : ""
}

// 以完整页面呈现条码页：用 Navigation.useDismiss 提供返回键（返回后停留原历史/收藏页）。
// 因导航栈内从子页 push 在真机无效、根级 destination 互斥，用 Navigation.present 呈现为独立新页面最可靠。
export function PresentedBarcodes({
  items,
  settings,
  favorites,
  onFavorite,
  onUnfavorite,
  onEdit,
}: {
  items: BarcodeItem[]
  settings: StyleSettings
  favorites: FavoriteItem[]
  onFavorite: (name: string, folder: string) => void
  onUnfavorite?: () => void
  onEdit?: () => void
}) {
  const dismiss = Navigation.useDismiss()
  function handleEdit() {
    if (onEdit) {
      dismiss()
      onEdit()
    }
  }
  return (
    <BarcodesPage
      items={items}
      settings={settings}
      favorites={favorites}
      onClose={dismiss}
      onFavorite={onFavorite}
      onUnfavorite={onUnfavorite}
      onEdit={onEdit ? handleEdit : undefined}
    />
  )
}
