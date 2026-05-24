## 构建与测试指令 (Build and Test Commands)

### 根项目 (Node/TS)
- 安装: `npm install`
- 构建: `npm run build`
- 全量测试: `npm test`
- 单文件测试: `npm test -- path/to/file.test.ts` (替换为实际文件路径)

### 模块 (Module): src-tauri (Rust)
- 构建: `cd src-tauri && cargo build`
- 全量测试: `cd src-tauri && cargo test`
- 单项测试: `cd src-tauri && cargo test -- test_name` (替换为实际模块或函数名)

## 工程规约 (Guidelines)

- **读前必改**: 在进行任何修改前，务必完整阅读相关文件内容。
- **原子作业**: 每次仅实现一个功能或修复一个 Bug。
- **验证驱动**: 任务完成前必须运行测试进行验证。
- **路径规范**: 仅使用相对路径（例如：`src/main/java/App.java`，严禁使用 `./src/...`）。
- **风格对齐**: 必须遵循代码库中已有的编码风格和设计模式。
- **环境感知**: 利用你对各语言默认本地仓库路径（如 Maven、Node）的知识，协助排查依赖问题或进行源码分析。

