import { ScrollView, VStack, HStack, Text, Spacer, Image, modifiers, RoundedRectangle, ColorPicker, Toggle, Picker, Slider } from "scripting"
import { StyleSettings } from "./barcode_core"
import { CS, schemeProps, lab, sub, cardB, FullScreenBg } from "./theme"
// 设置页：样式设置（条码颜色/背景颜色/显示文字/文字位置/文字大小/条码高度/条码宽度/边距）

// 数值调节行：右侧滑杆调节（min/max 约束），最右侧固定显示当前值与单位
function SliderRow({
  title,
  value,
  min,
  max,
  step,
  unit,
  onValue,
  cs,
}: {
  title: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onValue: (v: number) => void
  cs: CS
}) {
  return (
    <HStack
      alignment="center"
      spacing={10}
      modifiers={modifiers()
        .frame({ maxWidth: 'infinity' })
        .padding(14)
        .background({
          style: cardB(cs),
          shape: { type: "rect", cornerRadius: 20 },
        })
        .overlay({
          alignment: "center",
          content: (
            <RoundedRectangle
              cornerRadius={20}
              stroke={{
                shapeStyle: "rgba(255,255,255,0.28)",
                strokeStyle: { lineWidth: 1 },
              }}
            />
          ),
        })}
    >
      <Text
        font={16}
        fontWeight="bold"
        modifiers={modifiers().foregroundStyle(lab(cs))}
      >
        {title}
      </Text>
      <Spacer />
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChanged={onValue}
        modifiers={modifiers().frame({ width: 170 })}
      />
      <Text
        font={15}
        fontWeight="bold"
        modifiers={modifiers()
          .foregroundStyle("#3b82f6")
          .frame({ width: 60, alignment: 'trailing' })}
      >
        {Math.round(value * 10) / 10}{unit ?? ""}
      </Text>
    </HStack>
  )
}

export function SettingsPage({
  settings,
  onChange,
  onClose,
}: {
  settings: StyleSettings
  onChange: (patch: Partial<StyleSettings>) => void
  onClose: () => void
}) {
  // 当前外观设置（供根视图 themedMods 使用）
  const colorScheme = settings.colorScheme
  // 设置项卡片样式
  function cardMods() {
    return modifiers()
      .frame({ maxWidth: 'infinity' })
      .padding(14)
      .background({
        style: cardB(colorScheme),
        shape: { type: "rect", cornerRadius: 20 },
      })
      .overlay({
        alignment: "center",
        content: (
          <RoundedRectangle
            cornerRadius={20}
            stroke={{
              shapeStyle: "rgba(255,255,255,0.28)",
              strokeStyle: { lineWidth: 1 },
            }}
          />
        ),
      })
  }

  return (
    <FullScreenBg cs={colorScheme} decorative={false}>
    <ScrollView
      {...schemeProps(colorScheme)} modifiers={modifiers()
        .frame({ maxWidth: 'infinity', maxHeight: 'infinity' })
        
        .navigationTitle("设置")
         .navigationBarTitleDisplayMode("inline")}
    >
      <VStack alignment="leading" spacing={14} padding={{ top: 16, leading: 24, bottom: 24, trailing: 24 }}>
        {/* 外观：跟随系统 / 浅色 / 深色 */}
        <HStack alignment="center" spacing={10} modifiers={cardMods()}>
          <Text
            font={16}
            fontWeight="bold"
            modifiers={modifiers().foregroundStyle(lab(colorScheme))}
          >
            外观
          </Text>
          <Spacer />
          <Picker
            label={
              <HStack spacing={4}>
                <Text
                  font={15}
                  modifiers={modifiers().foregroundStyle("#3b82f6")}
                >
                  {colorScheme === "system"
                    ? "跟随系统"
                    : colorScheme === "light"
                    ? "浅色"
                    : "深色"}
                </Text>
                <Image
                  systemName="chevron.down"
                  renderingMode="template"
                  modifiers={modifiers().font(12).foregroundStyle(sub(colorScheme))}
                />
              </HStack>
            }
            value={colorScheme}
            onChanged={(v: string) =>
              onChange({ colorScheme: v as "system" | "light" | "dark" })
            }
            pickerStyle="menu"
          >
            <Text tag="system">跟随系统</Text>
            <Text tag="light">浅色</Text>
            <Text tag="dark">深色</Text>
          </Picker>
        </HStack>

        {/* 条码颜色：点击弹出系统颜色选择器 */}
        <HStack alignment="center" spacing={10} modifiers={cardMods()}>
          <Text
            font={16}
            fontWeight="bold"
            modifiers={modifiers().foregroundStyle(lab(colorScheme))}
          >
            条码颜色
          </Text>
          <Spacer />
          <ColorPicker
            value={settings.barColor as any}
            supportsOpacity={false}
            onChanged={(c) => onChange({ barColor: c })}
          >
            <HStack spacing={8}>
              <VStack
                modifiers={modifiers()
                  .frame({ width: 26, height: 26, alignment: 'center' })
                  .background({ style: settings.barColor as any, shape: "circle" })}
              />
              <Text
                font={14}
                modifiers={modifiers().foregroundStyle(sub(colorScheme))}
              >
                {settings.barColor}
              </Text>
            </HStack>
          </ColorPicker>
        </HStack>

        {/* 背景颜色：点击弹出系统颜色选择器 */}
        <HStack alignment="center" spacing={10} modifiers={cardMods()}>
          <Text
            font={16}
            fontWeight="bold"
            modifiers={modifiers().foregroundStyle(lab(colorScheme))}
          >
            背景颜色
          </Text>
          <Spacer />
          <ColorPicker
            value={settings.bgColor as any}
            supportsOpacity={false}
            onChanged={(c) => onChange({ bgColor: c })}
          >
            <HStack spacing={8}>
              <VStack
                modifiers={modifiers()
                  .frame({ width: 26, height: 26, alignment: 'center' })
                  .background({ style: settings.bgColor as any, shape: "circle" })}
              />
              <Text
                font={14}
                modifiers={modifiers().foregroundStyle(sub(colorScheme))}
              >
                {settings.bgColor}
              </Text>
            </HStack>
          </ColorPicker>
        </HStack>

        {/* 显示文字 */}
        <VStack alignment="leading" spacing={6} modifiers={cardMods()}>
          <Toggle
            value={settings.showText}
            onChanged={(v) => onChange({ showText: v })}
          >
            <Text
              font={16}
              fontWeight="bold"
              modifiers={modifiers().foregroundStyle(lab(colorScheme))}
            >
              显示文字
            </Text>
          </Toggle>
        </VStack>

        {/* 显示条码格式 */}
        <VStack alignment="leading" spacing={6} modifiers={cardMods()}>
          <Toggle
            value={settings.showFormat}
            onChanged={(v) => onChange({ showFormat: v })}
          >
            <Text
              font={16}
              fontWeight="bold"
              modifiers={modifiers().foregroundStyle(lab(colorScheme))}
            >
              显示条码格式
            </Text>
          </Toggle>
        </VStack>

        {/* 文字位置：下拉菜单选择 */}
        <HStack alignment="center" spacing={10} modifiers={cardMods()}>
          <Text
            font={16}
            fontWeight="bold"
            modifiers={modifiers().foregroundStyle(lab(colorScheme))}
          >
            文字位置
          </Text>
          <Spacer />
          <Picker
            label={
              <HStack spacing={4}>
                <Text
                  font={15}
                  modifiers={modifiers().foregroundStyle("#3b82f6")}
                >
                  {settings.textPosition === "top" ? "上方" : "下方"}
                </Text>
                <Image
                  systemName="chevron.down"
                  renderingMode="template"
                  modifiers={modifiers().font(12).foregroundStyle(sub(colorScheme))}
                />
              </HStack>
            }
            value={settings.textPosition}
            onChanged={(v: string) =>
              onChange({ textPosition: v as "top" | "bottom" })
            }
            pickerStyle="menu"
          >
            <Text tag="top">上方</Text>
            <Text tag="bottom">下方</Text>
          </Picker>
        </HStack>

        {/* 数值调节：右侧滑杆 */}
        <SliderRow
          title="文字大小"
          value={settings.textSize}
          min={10}
          max={24}
          onValue={(v) => onChange({ textSize: v })}
          cs={colorScheme}
        />

        <SliderRow
          title="条码高度"
          value={settings.barHeight}
          min={40}
          max={200}
          onValue={(v) => onChange({ barHeight: v })}
          cs={colorScheme}
        />

        <SliderRow
          title="条码宽度"
          value={settings.barWidth}
           min={0.5}
           max={8}
           step={0.1}
          onValue={(v) => onChange({ barWidth: v })}
          cs={colorScheme}
        />

        <SliderRow
          title="条码间距"
          value={settings.margin}
          min={0}
          max={40}
          onValue={(v) => onChange({ margin: v })}
          cs={colorScheme}
        />

        {/* 关于 */}
        <HStack alignment="center" spacing={10} modifiers={cardMods()}>
          <Text
            font={16}
            fontWeight="bold"
            modifiers={modifiers().foregroundStyle(lab(colorScheme))}
          >
            关于
          </Text>
          <Spacer />
          <VStack alignment="trailing" spacing={2}>
            <Text
              font={14}
              modifiers={modifiers().foregroundStyle(sub(colorScheme))}
            >
              作者: luckyalanzhou
            </Text>
            <Text
              font={14}
              modifiers={modifiers().foregroundStyle(sub(colorScheme))}
            >
              版本: 1.1.0
            </Text>
          </VStack>
        </HStack>
      </VStack>
    </ScrollView>
    </FullScreenBg>
  )
}
