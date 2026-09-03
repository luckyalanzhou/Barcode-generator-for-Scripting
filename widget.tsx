import { HStack, Image, Link, Text, VStack, Widget, Script, Device, modifiers, RoundedRectangle, Spacer } from "scripting"

type WidgetLanguage = "zh-Hans" | "zh-Hant" | "en"
function widgetLanguage(): WidgetLanguage {
  const first = (Device.preferredLanguages ?? [])[0]?.toLowerCase() ?? ""
  if (first.startsWith("zh-hant") || first.startsWith("zh-tw") || first.startsWith("zh-hk") || first.startsWith("zh-mo")) return "zh-Hant"
  if (first.startsWith("en")) return "en"
  return "zh-Hans"
}
const TEXTS = {
  "zh-Hans": { generate: "条码生成", barcode: "条码", quickAccess: "快速访问", scanFill: "扫描填充", recognizeFill: "识别文字并填入", recognize: "识别内容", favorites: "收藏夹", viewFavorites: "查看收藏", start: "一键开始", scan: "扫描", favorite: "收藏" },
  "zh-Hant": { generate: "條碼產生", barcode: "條碼", quickAccess: "快速存取", scanFill: "掃描填入", recognizeFill: "辨識文字並填入", recognize: "辨識內容", favorites: "收藏夾", viewFavorites: "查看收藏", start: "一鍵開始", scan: "掃描", favorite: "收藏" },
  en: { generate: "Barcode Generator", barcode: "Barcode", quickAccess: "Quick Access", scanFill: "Scan & Fill", recognizeFill: "Recognize and fill", recognize: "Recognize content", favorites: "Favorites", viewFavorites: "View favorites", start: "Get started", scan: "Scan", favorite: "Favorites" },
} as const

function ActionLink({ url, icon, title, subtitle }: { url: string; icon: string; title: string; subtitle?: string }) {
  return (
    <Link url={url}>
      <HStack spacing={8} modifiers={modifiers().frame({ maxWidth: "infinity", minHeight: 40 }).padding({ leading: 10, trailing: 10 }).background({ style: "rgba(120,130,150,0.10)", shape: { type: "rect", cornerRadius: 12 } })}>
        <Image systemName={icon} renderingMode="template" modifiers={modifiers().font(15).foregroundStyle("#3b82f6")} />
        <VStack alignment="leading" spacing={2}>
          <Text font={13} fontWeight="semibold">{title}</Text>
          {subtitle ? <Text font={10} modifiers={modifiers().foregroundStyle("secondaryLabel")}>{subtitle}</Text> : null}
        </VStack>
        <Spacer />
        <Image systemName="chevron.right" renderingMode="template" modifiers={modifiers().font(10).foregroundStyle("tertiaryLabel")} />
      </HStack>
    </Link>
  )
}

function CompactAction({ url, icon, title }: { url: string; icon: string; title: string }) {
  return (
    <Link url={url}>
      <VStack alignment="center" spacing={6} modifiers={modifiers().frame({ maxWidth: "infinity", minHeight: 58 }).padding({ top: 8, bottom: 8 }).background({ style: "rgba(120,130,150,0.065)", shape: { type: "rect", cornerRadius: 14 } })}>
        <Image systemName={icon} renderingMode="template" modifiers={modifiers().frame({ width: 30, height: 30, alignment: "center" }).padding(7).foregroundStyle("#3b82f6").background({ style: "rgba(59,130,246,0.10)", shape: { type: "rect", cornerRadius: 9 } })} />
        <Text font={11} fontWeight="medium">{title}</Text>
      </VStack>
    </Link>
  )
}

function MediumAction({ url, icon, title, hint }: { url: string; icon: string; title: string; hint: string }) {
  return (
    <Link url={url}>
      <VStack alignment="leading" spacing={6} modifiers={modifiers().frame({ maxWidth: "infinity", minHeight: 72 }).padding({ leading: 12, trailing: 12, top: 10, bottom: 10 }).background({ style: "rgba(120,130,150,0.065)", shape: { type: "rect", cornerRadius: 16 } })}>
        <Image systemName={icon} renderingMode="template" modifiers={modifiers().frame({ width: 30, height: 30, alignment: "center" }).padding(7).foregroundStyle("#3b82f6").background({ style: "rgba(59,130,246,0.11)", shape: { type: "rect", cornerRadius: 10 } })} />
        <VStack alignment="leading" spacing={1}>
          <Text font={13} fontWeight="semibold">{title}</Text>
          <Text font={10} modifiers={modifiers().foregroundStyle("secondaryLabel")}>{hint}</Text>
        </VStack>
      </VStack>
    </Link>
  )
}

function WidgetView() {
  const openURL = Script.createRunURLScheme("条码生成器")
  const scanURL = Script.createRunSingleURLScheme("条码生成器", { action: "scan" })
  const favoritesURL = Script.createRunURLScheme("条码生成器", { action: "favorites" })
  const family = Widget.family
  const t = TEXTS[widgetLanguage()]
  const isSmall = family === "systemSmall"
  const isMedium = family === "systemMedium"
  const isLarge = family === "systemLarge" || family === "systemExtraLarge"
  const isCircular = family === "accessoryCircular"
  const isInline = family === "accessoryInline"
  const isRectangular = family === "accessoryRectangular"

  if (isInline) {
    return <Link url={openURL}><HStack spacing={4}><Image systemName="barcode.viewfinder" renderingMode="template" /><Text font={12} fontWeight="semibold">{t.generate}</Text></HStack></Link>
  }

  if (isCircular) {
    return (
      <Link url={openURL}>
        <VStack alignment="center" spacing={3} modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" }).background({ style: "regularMaterial", shape: "concentricRect" })}>
          <Image systemName="barcode.viewfinder" renderingMode="template" modifiers={modifiers().font(24).foregroundStyle("#3b82f6")} />
          <Text font={10} fontWeight="semibold">{t.barcode}</Text>
        </VStack>
      </Link>
    )
  }

  if (isRectangular) {
    return (
      <Link url={scanURL}>
        <HStack spacing={8} modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" }).padding({ leading: 10, trailing: 10 })}>
          <Image systemName="viewfinder" renderingMode="template" modifiers={modifiers().font(20).foregroundStyle("#3b82f6")} />
          <VStack alignment="leading" spacing={2}>
            <Text font={13} fontWeight="semibold">{t.scanFill}</Text>
            <Text font={10} modifiers={modifiers().foregroundStyle("secondaryLabel")}>{t.generate}</Text>
          </VStack>
        </HStack>
      </Link>
    )
  }

  const header = isMedium ? (
    <HStack alignment="center" spacing={8} modifiers={modifiers().frame({ maxWidth: "infinity" })}>
      <Image systemName="barcode.viewfinder" renderingMode="template" modifiers={modifiers().font(20).foregroundStyle("#3b82f6")} />
      <Text font={17} fontWeight="semibold">{t.generate}</Text>
      <Spacer />
      <Text font={11} modifiers={modifiers().foregroundStyle("secondaryLabel")}>{t.quickAccess}</Text>
    </HStack>
  ) : (
    <HStack alignment="center" spacing={10}>
      <Image systemName="barcode.viewfinder" renderingMode="template" modifiers={modifiers().frame({ width: isSmall ? 40 : 44, height: isSmall ? 40 : 44, alignment: "center" }).padding(isSmall ? 10 : 11).foregroundStyle("#ffffff").background({ style: "#3b82f6", shape: { type: "rect", cornerRadius: 12 } })} />
      <VStack alignment="leading" spacing={2}>
        <Text font={isSmall ? 16 : 17} fontWeight="semibold">{t.generate}</Text>
        <Text font={11} modifiers={modifiers().foregroundStyle("secondaryLabel")}>{t.quickAccess}</Text>
      </VStack>
    </HStack>
  )

  return (
    <VStack
      alignment="leading"
      spacing={isSmall ? 10 : isMedium ? 8 : 14}
      modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" }).padding(isSmall ? 14 : isMedium ? 9 : 18).background({ style: "regularMaterial", shape: "concentricRect" }).overlay({ alignment: "center", content: <RoundedRectangle cornerRadius={22} stroke={{ shapeStyle: "rgba(120,130,150,0.24)", strokeStyle: { lineWidth: 1 } }} /> }).widgetURL(openURL)}
    >
      {header}
      {isSmall ? (
        <VStack alignment="leading" spacing={7} modifiers={modifiers().frame({ maxWidth: "infinity" })}>
          <Text font={11} modifiers={modifiers().foregroundStyle("secondaryLabel")}>{t.start}</Text>
          <ActionLink url={scanURL} icon="viewfinder" title={t.scanFill} subtitle={t.recognizeFill} />
        </VStack>
      ) : isMedium ? (
        <HStack spacing={8} modifiers={modifiers().frame({ maxWidth: "infinity" })}>
          <MediumAction url={scanURL} icon="viewfinder" title={t.scanFill} hint={t.recognize} />
          <MediumAction url={favoritesURL} icon="heart" title={t.favorites} hint={t.viewFavorites} />
        </HStack>
      ) : (
        <VStack alignment="leading" spacing={10} modifiers={modifiers().frame({ maxWidth: "infinity" })}>
          <Text font={13} fontWeight="medium">{t.quickAccess}</Text>
          <HStack spacing={7} modifiers={modifiers().frame({ maxWidth: "infinity" })}>
            <CompactAction url={scanURL} icon="viewfinder" title={t.scan} />
            <CompactAction url={favoritesURL} icon="heart" title={t.favorite} />
          </HStack>
        </VStack>
      )}
    </VStack>
  )
}

Widget.present(<WidgetView />)
