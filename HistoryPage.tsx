import { ScrollView, VStack, HStack, Text, Spacer, Button, Image, modifiers, useState } from "scripting"
import { BarcodeItem, BarcodeType, StyleSettings } from "./barcode_core"
import { HistoryItem, FavoriteItem } from "./storage"
import { PresentedBarcodes } from "./BarcodesPage"
import { CS, schemeProps, lab, sub, cardB, FullScreenBg } from "./theme"

function formatHistoryTime(time: number): string {
  const d = new Date(time), now = new Date(), pad = (n: number) => String(n).padStart(2, "0")
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate() ? hm : `${d.getMonth()+1}/${d.getDate()} ${hm}`
}
// 历史记录页：展示最近生成列表，点击条目进入条码页查看
export function HistoryPage({
  history,
  colorScheme,
  settings,
  favorites,
  barcodeType,
  buildItems,
  onFavorite,
  onClose,
  onClear,
}: {
  history: HistoryItem[]
  colorScheme: "system" | "light" | "dark"
  settings: StyleSettings
  favorites: FavoriteItem[]
  barcodeType: BarcodeType
  buildItems: (texts: string[], type: BarcodeType) => Promise<BarcodeItem[]>
  onFavorite: (name: string, folder: string) => void
  onClose: () => void
  onClear: () => void
}) {
  const [selectedHistory, setSelectedHistory] = useState<{ item: HistoryItem; items: BarcodeItem[] } | null>(null)

  // 点击历史条目：交给 NavigationStack 推入原生导航页。
  async function selectHistory(item: HistoryItem) {
    const barcodeItems = await buildItems(item.texts, item.type)
    setSelectedHistory({ item, items: barcodeItems })
  }

  return (
    <FullScreenBg cs={colorScheme}>
    <ScrollView
      {...schemeProps(colorScheme)} modifiers={modifiers()
        .frame({ maxWidth: 'infinity', maxHeight: 'infinity' })
        .navigationTitle("历史记录")
        .navigationBarTitleDisplayMode("inline")
        .toolbar({
          topBarTrailing: <Button action={onClear} modifiers={modifiers().frame({ width: 40, height: 40, alignment: "center" }).padding(0).font(20).foregroundStyle(sub(colorScheme)).contentShape({ type: "rect", cornerRadius: 12 })}>
            <Image systemName="trash" renderingMode="template" />
          </Button>,
        })
        .navigationDestination({
          isPresented: selectedHistory != null,
          onChanged: (value: boolean) => {
            if (!value) setSelectedHistory(null)
          },
          content: selectedHistory ? (
            <PresentedBarcodes
              items={selectedHistory.items}
              settings={settings}
              favorites={favorites}
              onFavorite={onFavorite}
              showCustomBack={false}
              showFavoriteAction={false}
              showShareAction={false}
            />
          ) : <Text />,
        })}
    >
      <VStack alignment="center" spacing={12} padding={16}>
        {history.length === 0 ? (
          <Text
            font={16}
            modifiers={modifiers()
              .foregroundStyle(sub(colorScheme))
              .padding({ top: 60 })}
          >
            暂无最近生成
          </Text>
        ) : (
          history.map((item) => (
            <Button
              key={item.id}
              action={() => selectHistory(item)}
              modifiers={modifiers()
                .frame({ maxWidth: 'infinity' })
                .padding(10)
                .background({
                  style: cardB(colorScheme),
                  shape: { type: "rect", cornerRadius: 15 },
                })}
            >
              <HStack alignment="center" spacing={8}>
                <Text
                  font={15}
                  modifiers={modifiers().lineLimit(1).foregroundStyle(lab(colorScheme))}
                >
                  {item.texts.length === 1
                    ? item.texts[0]
                    : `${item.texts.length} 条：${item.texts.join("、")}`}
                </Text>
                <Spacer />
                <Text
                  font={12}
                  modifiers={modifiers().foregroundStyle(sub(colorScheme))}
                >
                  {formatHistoryTime(item.time)}
                </Text>
              </HStack>
            </Button>
          ))
        )}
      </VStack>
    </ScrollView>
    </FullScreenBg>
  )
}
