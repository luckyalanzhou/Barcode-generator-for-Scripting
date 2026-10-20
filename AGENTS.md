## 技能选择

按任务语义自动使用当前可用、且技能自身允许自动调用的匹配技能，并遵循其触发条件：

- 模块接口与代码边界：`codebase-design`
- 疑难故障或性能回退：`diagnosing-bugs`
- 用户要求测试先行或集成测试：`tdd`
- 用户要求基于基线与需求审查改动：`code-review`
- 编辑项目指令或技能文件：`writing-for-agents`
- 其他任务：按已加载技能的描述判断

标记 `allow_implicit_invocation: false` 的技能只在用户显式调用时运行。技能来源由当前工作区已加载的插件与技能清单决定；本节只负责任务路由。
## Shell

- Execute project commands with Windows PowerShell using PowerShell syntax and Windows paths.
- Keep the Codex agent environment set to Windows native and the integrated terminal set to PowerShell.
- Use Bash, WSL, or Git Bash only when a task explicitly requires them; explain the reason first.
