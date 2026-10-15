# 条码生成器

运行于 iPhone 和 iPad 上 **Scripting** 应用内的原生脚本，用于批量生成、收藏和管理条码。它不是独立安装的 iOS App。

## 功能

- 支持 QR Code、Code 128-B、Code 39、EAN-13、EAN-8、UPC-A、ITF-14 和 Codabar。
- 支持多行批量生成；EAN、UPC 和 ITF-14 可自动计算并校验校验位。
- 可扫描条码填充输入，管理收藏夹与文件夹、查看生成历史，并导入或导出收藏备份。
- 提供自定义显示样式和 Scripting 主屏幕小组件。

## 安装

先在 iPhone 或 iPad 上安装 [Scripting](https://apps.apple.com/us/app/scripting/id6479691128)，然后点击：

[一键添加到 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fluckyalanzhou%2FBarcode-generator-for-Scripting%22%5D)

在 Scripting 中确认导入即可。也可以在 Scripting 的导入功能中粘贴仓库地址：

```text
https://github.com/luckyalanzhou/Barcode-generator-for-Scripting
```

更新或重新导入前，建议在“收藏”标签长按并导出备份，以保留本地收藏数据。

## 使用

1. 打开“条码生成器”，选择条码类型并输入内容；多行输入可分别生成多条码。
2. 点击“生成条码”。例如选择 EAN-13，输入 `4006381333931` 后生成。
3. 长按底部标签可使用快捷操作：在“生成”中扫描填充，在“收藏”中导入或导出备份，在“历史”中清空历史。
4. 添加 Scripting 小组件到 iOS 主屏幕，可快速查看收藏或使用扫描填充。

## 本地开发

需要 Node.js 20+ 和 pnpm 9+。克隆仓库后运行：

```sh
git clone https://github.com/luckyalanzhou/Barcode-generator-for-Scripting.git
cd Barcode-generator-for-Scripting
pnpm install --frozen-lockfile
pnpm scripting:dev
```

然后在 Scripting 应用中连接 CLI 提供的本地工作区。脚本由 Scripting 负责运行；本项目不构建独立 iOS 安装包，也不需要 Xcode。

## 版本、兼容性与许可

- 当前仓库元数据版本：`1.2.4`（见 [`script.json`](script.json)）。
- 获取更新：从 Scripting 重新导入本仓库的最新版本；重新导入前先导出收藏备份。
- 需要 iPhone 或 iPad 上的 Scripting 应用；[App Store 当前列出的系统要求为 iOS/iPadOS 17.0 或更新版本](https://apps.apple.com/us/app/scripting/id6479691128)。本仓库未单独声明最低 Scripting 应用版本。
- 反馈问题或建议，请前往 [GitHub Issues](https://github.com/luckyalanzhou/Barcode-generator-for-Scripting/issues)。
- 仓库当前没有 `LICENSE` 文件，尚未声明开源许可；公开可见不代表可按某种开源协议复用。
