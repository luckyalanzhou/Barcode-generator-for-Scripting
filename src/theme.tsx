import { ZStack, VStack, modifiers } from "scripting"
export type CS = "system" | "light" | "dark"
const THEME = {
  pageBg: { light: "#f4f6fb", dark: "#10131b" }, label: { light: "#111318", dark: "#f5f5f7" }, sub: { light: "#6b7280", dark: "#c7c7cc" }, tertiary: { light: "#9ca3af", dark: "#8e8e93" }, card: { light: "rgba(255,255,255,0.58)", dark: "rgba(38,40,48,0.82)" }, capsule: { light: "rgba(255,255,255,0.72)", dark: "rgba(38,40,48,0.9)" }, input: { light: "#374151", dark: "#e5e7eb" },
} as const
export function schemeProps(cs: CS) { return cs === "system" ? {} : { preferredColorScheme: cs as "light" | "dark" } }
export function lab(cs: CS): any { return cs === "system" ? "label" : cs === "dark" ? THEME.label.dark : THEME.label.light }
export function sub(cs: CS): any { return cs === "system" ? "secondaryLabel" : cs === "dark" ? THEME.sub.dark : THEME.sub.light }
export function ter(cs: CS): any { return cs === "system" ? "tertiaryLabel" : cs === "dark" ? THEME.tertiary.dark : THEME.tertiary.light }
export function cardB(cs: CS): any { return cs === "system" ? "regularMaterial" : cs === "dark" ? THEME.card.dark : THEME.card.light }
export function capB(cs: CS): any { return cs === "system" ? "regularMaterial" : cs === "dark" ? THEME.capsule.dark : THEME.capsule.light }
export function pageB(cs: CS): any { return cs === "system" ? "systemBackground" : cs === "dark" ? THEME.pageBg.dark : THEME.pageBg.light }
export function inputT(cs: CS): any { return cs === "system" ? "label" : cs === "dark" ? THEME.input.dark : THEME.input.light }
export function FullScreenBg({ cs, decorative = false, children }: { cs: CS; decorative?: boolean; children: any }) {
  return <ZStack><VStack modifiers={modifiers().frame({ maxWidth: "infinity", maxHeight: "infinity" }).background({ style: pageB(cs), shape: { type: "rect", cornerRadius: 0 } }).ignoresSafeArea()} />{decorative && <VStack modifiers={modifiers().frame({ width: 240, height: 240 }).offset({ x: -130, y: -260 }).background({ style: "rgba(59,130,246,0.18)", shape: "circle" }).blur(48)} />}{children}</ZStack>
}
