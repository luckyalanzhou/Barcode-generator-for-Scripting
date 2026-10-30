# 项目规则

## 执行环境

- 使用 Windows 原生环境、PowerShell 语法和 Windows 路径。只有任务明确要求时才使用 Bash、WSL 或 Git Bash，并先说明原因。

## 技能选择

- 按任务选择当前已加载且符合触发条件的技能；用户指定的技能优先。标记 `allow_implicit_invocation: false` 的技能只在用户明确指定时使用。
- 项目文档、上手文档和报告：`project-docs`、`codegen-doc`、`md-report-summary`。
- 图表：`codegen-diagram`、`drawio-diagram`、`excalidraw-diagram`、`pptgen-drawio`。
- PDF 与 Office 文件：`pdf`、`office-file-process`。
- 论文、专利和公众号文章：`paper-write`、`patent-write`、`wechat-article-writer`；Skill 与 Prompt 格式转换：`skill-prompt-convert`。
- UI 设计、评审和改版优先使用 `impeccable`；需要探索额外视觉方向时使用 `design-taste-frontend`。
- 外部技能与 Codex 内置技能功能重合时优先使用外部技能。只加载当前任务相关的技能；项目规则和用户授权优先。

## Git/GitHub

- 每个新 Git/GitHub 任务先用普通权限运行 Git，不因历史失败或记忆跳过这一步。
- 权限或沙箱限制时申请提权并重试；若提权被拒绝，停止操作，不改用其他工具绕过。
- Git 提权重试仍因权限限制失败，且操作可由 GitHub CLI 完成时，改用 `D:\gh.exe`；该工具遇到权限限制时再申请提权。
- 提权只用于解决权限或沙箱限制。冲突、参数错误和认证错误应按其原因处理，不以提权规避。
- 本地提交、分支和工作区操作使用 Git；`D:\gh.exe` 仅替代它实际支持的操作。
- 所有允许的方式都失败时，说明失败原因、已完成的步骤和当前状态。
