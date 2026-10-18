# 条码生成器

适用于 iPhone 和 iPad 的 Scripting 脚本，支持批量生成、收藏和管理条码。

## 功能

- 支持 QR Code、Code 128-B、Code 39、EAN-13、EAN-8、UPC-A、ITF-14 和 Codabar。
- 多输入行批量生成，自动计算并校验 EAN、UPC 和 ITF-14 校验位。
- 扫描填充、收藏与文件夹管理、历史记录、收藏备份导入与导出。
- 自定义显示样式；主屏幕小组件提供收藏页和扫描填充快捷入口。

## 安装

安装 [Scripting](https://apps.apple.com/us/app/scripting/id6479691128)，再点击下方链接并确认导入：

[一键添加到 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fluckyalanzhou%2FBarcode-generator-for-Scripting%22%5D)

也可在 Scripting 中导入仓库地址：

```text
https://github.com/luckyalanzhou/Barcode-generator-for-Scripting
```

## 使用

选择条码类型，填写输入行，点击“生成条码”。每行生成一条条码，例如 EAN-13：`4006381333931`。

长按底部标签可使用快捷操作：

- **生成**：扫描填充。
- **收藏**：导入或导出备份，建议更新前导出。
- **历史**：清空历史。

## 版本、兼容性与许可

- 当前版本：`1.2.4`（[`script.json`](script.json)）；未配置自动更新。
- 系统要求见 [Scripting App Store 页面](https://apps.apple.com/us/app/scripting/id6479691128)。
- 问题反馈：[GitHub Issues](https://github.com/luckyalanzhou/Barcode-generator-for-Scripting/issues)。
- 许可：[MIT](LICENSE)。
