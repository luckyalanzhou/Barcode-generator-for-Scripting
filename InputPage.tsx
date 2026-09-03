import { ScrollView, VStack, HStack, Text, Spacer, Button, Image, TextField, Picker, RoundedRectangle, modifiers, useKeyboardVisible } from "scripting"
import { BarcodeType, BARCODE_TYPES, MAX_BARCODE_ITEMS, typeName, scanTexts } from "./barcode_core"
import { CS, lab, sub, cardB, capB, inputT } from "./theme"

declare function alert(message: string): Promise<void>

type Props = {
  inputRows: string[]
  barcodeType: BarcodeType
  colorScheme: CS
  pressedKey: string | null
  inputFocusTick: number
  isGenerating: boolean
  onInputRowsChange: (rows: string[]) => void
  onBarcodeTypeChange: (type: BarcodeType) => void
  onGenerate: () => void
  onScan?: () => void
  onPressed: (key: string) => void
}

export function InputPage({ inputRows, barcodeType, colorScheme, pressedKey, inputFocusTick, isGenerating, onInputRowsChange, onBarcodeTypeChange, onGenerate, onScan, onPressed }: Props) {
  const keyboardVisible = useKeyboardVisible()
  const hasInput = inputRows.some((row) => row.trim().length > 0)
  const update = (index: number, value: string) => onInputRowsChange(inputRows.map((s, i) => i === index ? value : s))
  const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= inputRows.length) return; const next = [...inputRows]; [next[index], next[target]] = [next[target], next[index]]; onInputRowsChange(next) }
  const remove = (index: number) => onInputRowsChange(inputRows.length === 1 ? [""] : inputRows.filter((_, i) => i !== index))
  const add = () => { const nonEmpty = inputRows.filter((s) => s.trim().length > 0).length; if (inputRows.length < MAX_BARCODE_ITEMS && nonEmpty < MAX_BARCODE_ITEMS) onInputRowsChange([...inputRows, ""]) }
  const clear = () => onInputRowsChange([""])
  const scan = async () => { if (onScan) return onScan(); const texts = await scanTexts(); if (texts === null) return; onInputRowsChange([...inputRows.filter((s) => s.trim()), ...texts].slice(0, MAX_BARCODE_ITEMS)); if (texts.length > MAX_BARCODE_ITEMS) await alert(`扫描结果超过 ${MAX_BARCODE_ITEMS} 条，已只保留前 ${MAX_BARCODE_ITEMS} 条`) }
  return <VStack alignment="center" spacing={15.9} padding={{ top: 23.35, leading: 20, bottom: 20, trailing: 20 }}>
    <VStack alignment="leading" spacing={6} modifiers={modifiers().frame({ maxWidth: "infinity" }).padding({ bottom: 6 })}><HStack spacing={10} alignment="center"><Image systemName="barcode.viewfinder" renderingMode="template" modifiers={modifiers().font(28).foregroundStyle("#3b82f6")} /><Text font={26} fontWeight="bold" modifiers={modifiers().foregroundStyle(lab(colorScheme))}>条码生成器</Text></HStack></VStack>
    <VStack alignment="leading" spacing={10} modifiers={modifiers().frame({ maxWidth: "infinity" })}>
      <ScrollView modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: 386 })}>{inputRows.map((row, index) => <HStack key={`input-row-${index}`} alignment="center" spacing={6} modifiers={modifiers().frame({ maxWidth: "infinity", height: 56 }).padding({ leading: 6, trailing: 6 }).background({ style: capB(colorScheme), shape: { type: "rect", cornerRadius: 14 } })}><Text font={18} fontWeight="bold" modifiers={modifiers().frame({ width: 30, height: 32, alignment: "center" }).foregroundStyle(lab(colorScheme))}>{index + 1}</Text><TextField title="" prompt="输入数字或文本" value={row} onChanged={(value: string) => update(index, value)} modifiers={modifiers().frame({ maxWidth: "infinity", height: 56 }).font(16).foregroundStyle(inputT(colorScheme))} />{inputRows.length > 1 && <HStack spacing={4} modifiers={modifiers().padding({ leading: 2, trailing: 2 })}><Button action={() => { if (index > 0) { onPressed(`up-${index}`); move(index, -1) } }} modifiers={modifiers().frame({ width: 32, height: 32, alignment: "center" }).padding(0).font(18).fontWeight("bold").foregroundStyle(index === 0 ? sub(colorScheme) : pressedKey === `up-${index}` ? "#1d4ed8" : "#3b82f6")}><Image systemName="chevron.up" renderingMode="template" /></Button><Button action={() => { if (index < inputRows.length - 1) { onPressed(`down-${index}`); move(index, 1) } }} modifiers={modifiers().frame({ width: 32, height: 32, alignment: "center" }).padding(0).font(18).fontWeight("bold").foregroundStyle(index === inputRows.length - 1 ? sub(colorScheme) : pressedKey === `down-${index}` ? "#1d4ed8" : "#3b82f6")}><Image systemName="chevron.down" renderingMode="template" /></Button><HStack modifiers={modifiers().frame({ width: 30, height: 36, alignment: "center" }).padding(0).foregroundStyle("#FF6B6B").onTapGesture(() => remove(index)).onLongPressGesture({ minDuration: 500, perform: clear })}><Image systemName="trash" renderingMode="template" /></HStack></HStack>}</HStack>)}</ScrollView>
      <HStack spacing={12} modifiers={modifiers().frame({ maxWidth: "infinity" }).padding({ top: 6, bottom: 10 })}><Button title="+添加一行" action={add} modifiers={modifiers().offset({ x: 38, y: 0 }).font(16).fontWeight("medium").foregroundStyle("#3b82f6")} /><Spacer /><Button action={scan} modifiers={modifiers().offset({ x: -38, y: 0 }).font(16).fontWeight("medium").foregroundStyle("#3b82f6")}><HStack spacing={5}><Image systemName="viewfinder" renderingMode="template" /><Text font={16} fontWeight="medium">扫描填充</Text></HStack></Button></HStack>
    </VStack>
    <HStack alignment="center" spacing={10} modifiers={modifiers().frame({ maxWidth: "infinity", minHeight: 56, maxHeight: 56 }).padding({ leading: 16, trailing: 16 }).background({ style: cardB(colorScheme), shape: { type: "rect", cornerRadius: 16 } })}><Text font={15} fontWeight="semibold" modifiers={modifiers().foregroundStyle(lab(colorScheme))}>条码类型</Text><Spacer /><Picker label={<Text font={15} modifiers={modifiers().foregroundStyle("#3b82f6")}>{typeName(barcodeType)}</Text>} value={barcodeType} onChanged={(v: string) => onBarcodeTypeChange(v as BarcodeType)} pickerStyle="menu">{BARCODE_TYPES.map((t) => <Text tag={t.id}>{t.name}</Text>)}</Picker></HStack>
    <Button action={() => { if (hasInput && !isGenerating) onGenerate() }} modifiers={modifiers().frame({ maxWidth: "infinity", minHeight: 56, maxHeight: 56, alignment: "center" }).font(18).fontWeight("bold").foregroundStyle(hasInput ? "#ffffff" : sub(colorScheme)).background({ style: hasInput ? "#3b82f6" : colorScheme === "dark" ? "rgba(90,110,145,0.42)" : "rgba(59,130,246,0.14)", shape: { type: "rect", cornerRadius: 16 } })}><HStack modifiers={modifiers().frame({ maxWidth: "infinity", minHeight: 56, maxHeight: 56, alignment: "center" })}><Spacer /><Text>{isGenerating ? "生成中…" : "生成条码"}</Text><Spacer /></HStack></Button>
  </VStack>
}
