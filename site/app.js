document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const languageStorageKey = "swarm-editor-language";

const translations = {
  "zh-CN": {
    "meta.description": "Swarm Editor：围绕 Pi 构建的 Kotlin/JVM Compose Desktop AI IDE，让多智能体协作成为可验证的软件工程系统。",
    "accessibility.skip": "跳到主要内容",
    "accessibility.home": "Swarm Editor 首页",
    "accessibility.navigation": "主导航",
    "accessibility.facts": "项目技术特征",
    "accessibility.mockNavigation": "界面示意导航",
    "language.label": "语言选择",
    "nav.capabilities": "能力",
    "nav.architecture": "架构",
    "nav.build": "构建",
    "nav.source": "查看源码",
    "hero.title": "把 Agent 从聊天窗口，推进到<span>可验证的软件工程系统</span>",
    "hero.lead": "Swarm Editor 是 Kotlin/JVM Compose Desktop AI IDE。主 Agent 按需构建子 Agent，在隔离工作区内规划、实现、检查，并交付可审查的 Git Artifact。",
    "hero.explore": "探索架构",
    "hero.start": "快速开始",
    "mock.graph": "Agent Graph · 流程示意",
    "mock.evidence": "Evidence · 流程示意",
    "capabilities.title": "不是更多聊天框，<br />而是更完整的工程闭环。",
    "capabilities.swarmTitle": "Agent 按需生成，而非预设堆叠",
    "capabilities.swarmBody": "主 Agent 生成任务 DAG，运行时按需实例化子 Agent；角色、重试、写入与验证范围、任务图位置，以及仓库定位通过 Tarjan SCC 折叠循环依赖簇得到的风险证据，共同形成目标推理强度，再从模型池选择最匹配且有实时容量的模型。每个 Pi 节点只接收与任务所有权匹配的仓库证据、调度理由、修订契约和有预算的上游交付；结果被解析为结果、证据、变更、验证、风险和下游交付六段结构，同时保留原文审计。关键路径、结构影响力与 SCC 风险参与调度，模型池与主 Agent 双重并发上限负责真实限流，完成、失败或取消都会释放租约并记录实际模型，同时保存需求评分与选择原因。",
    "capabilities.lspTitle": "LSP 驱动的源码理解",
    "capabilities.lspBody": "设置中心可按需安装、哈希校验并连接 JetBrains Kotlin LSP 262.9593.0；真实 stdio 初始化成功后提供语义高亮、文档符号、诊断与行级导航，不可用时回退 JVM 语法高亮。Markdown、HTML、JSON 支持源码与预览双渲染。",
    "capabilities.evidenceTitle": "结果必须可审查",
    "capabilities.evidenceBody": "Swarm 任务持久化调度决策、Agent 工具审计、验证结果与工作区差异；产生变更的任务额外交付 Diff、补丁和 Git Artifact。",
    "capabilities.isolationBody": "原生仓库命令使用 Git worktree 与 Linux Bubblewrap；哈希固定的确定性插件使用可安装、可修复、版本与二进制哈希均可验证的 Wasmtime 47.0.2。",
    "architecture.title": "更短的数据路径，<br />更清晰的责任边界。",
    "architecture.body": "桌面 UI 与后端处于同一 JVM 进程。没有为本地应用制造额外的 HTTP 或 WebSocket 层，只有 Kotlin 与 Pi 子进程之间使用受控 JSONL stdio。",
    "architecture.process": "UI、状态与服务保持进程内直接调用。",
    "architecture.scheduling": "关键路径、下游覆盖、桥接中心性与文件所有权冲突共同参与调度。",
    "architecture.review": "侧拉 Diff、Agent 日志、检查结果与证据记录可以关联追踪。",
    "principle.quote": "“下一代 AI IDE 的关键，不是让模型说得更多，而是让系统能够规划、执行、验证，并解释它为何可信。”",
    "build.title": "从修改到反馈，<br />只保留必要路径。",
    "build.body": "默认 compile 路径跳过昂贵的 Pi 重建，并使用 Gradle daemon、并行执行、构建缓存与配置缓存；添加 <code>--watch</code> 后启用文件监听。Pages 部署必须先通过完整测试与构建门禁。",
    "build.watchComment": "# 持续监听 Kotlin 源码变更",
    "build.runComment": "# 准备 Pi runtime 并启动桌面端",
    "build.verifyComment": "# 验证 Pages 上公开承诺的就绪能力",
    "copy.copy": "复制",
    "copy.copied": "已复制",
    "copy.label": "复制快速编译命令",
    "closing.title": "让每一个 Agent 行为，都成为可以检查的工程事实。",
    "closing.source": "查看项目源码",
    "footer.back": "返回顶部 ↑",
  },
  en: {
    "meta.description": "Swarm Editor is a Pi-native Kotlin/JVM Compose Desktop AI IDE that turns multi-agent collaboration into a verifiable software engineering system.",
    "accessibility.skip": "Skip to main content",
    "accessibility.home": "Swarm Editor home",
    "accessibility.navigation": "Main navigation",
    "accessibility.facts": "Project technology highlights",
    "accessibility.mockNavigation": "Interface preview navigation",
    "language.label": "Language",
    "nav.capabilities": "Capabilities",
    "nav.architecture": "Architecture",
    "nav.build": "Build",
    "nav.source": "View source",
    "hero.title": "Move agents beyond chat into a <span>verifiable engineering system</span>",
    "hero.lead": "Swarm Editor is a Kotlin/JVM Compose Desktop AI IDE. The primary agent creates sub-agents on demand to plan, implement, and verify work in isolated workspaces, then delivers reviewable Git artifacts.",
    "hero.explore": "Explore architecture",
    "hero.start": "Quick start",
    "mock.graph": "Agent Graph · Live concept",
    "mock.evidence": "Evidence · Live concept",
    "capabilities.title": "Not more chat panels.<br />A complete engineering loop.",
    "capabilities.swarmTitle": "Agents created on demand, not stacked in advance",
    "capabilities.swarmBody": "The primary agent produces a task DAG and creates sub-agents only when needed. Role, retries, write and verification scope, graph position, and repository risk evidence from Tarjan SCC cycle collapsing determine target reasoning depth before the scheduler selects the best available model. Each Pi node receives only task-owned repository evidence, scheduling rationale, revision contracts, and budgeted upstream handoffs. Results are parsed into outcome, evidence, changes, verification, risks, and downstream handoffs while preserving the original response for audit. Critical path, structural influence, and SCC risk guide scheduling; model-pool and primary-agent concurrency limits enforce real capacity. Completion, failure, and cancellation release leases and record the model actually used, requirement score, and selection rationale.",
    "capabilities.lspTitle": "LSP-powered source understanding",
    "capabilities.lspBody": "Settings can install, checksum, and connect JetBrains Kotlin LSP 262.9593.0 on demand. After a successful real stdio initialization, it provides semantic highlighting, document symbols, diagnostics, and line-level navigation, with JVM syntax highlighting as fallback. Markdown, HTML, and JSON support paired source and rendered previews.",
    "capabilities.evidenceTitle": "Every result stays reviewable",
    "capabilities.evidenceBody": "Swarm tasks persist scheduling decisions, agent tool audits, verification results, and workspace changes. Tasks that modify code also deliver a diff, patch, and Git artifact.",
    "capabilities.isolationBody": "Native repository commands use Git worktrees and Linux Bubblewrap. Hash-pinned deterministic plugins use an installable, repairable Wasmtime 47.0.2 runtime whose version and binary checksum are both verified.",
    "architecture.title": "A shorter data path.<br />Clearer ownership.",
    "architecture.body": "The desktop UI and backend share one JVM process. Local application calls do not add HTTP or WebSocket layers; only Kotlin and the Pi subprocess communicate through controlled JSONL stdio.",
    "architecture.process": "UI, state, and services communicate directly in process.",
    "architecture.scheduling": "Critical path, downstream reach, bridge centrality, and file ownership conflicts shape scheduling.",
    "architecture.review": "Side-sheet diffs, agent logs, checks, and evidence remain linked and traceable.",
    "principle.quote": "“The next AI IDE is not about making models talk more. It is about systems that plan, execute, verify, and explain why their work can be trusted.”",
    "build.title": "From edit to feedback,<br />keep only the essential path.",
    "build.body": "The default compile path skips expensive Pi rebuilds and uses the Gradle daemon, parallel execution, build cache, and configuration cache. Add <code>--watch</code> for file watching. Pages deployment must pass the complete test and build gate.",
    "build.watchComment": "# Watch Kotlin source changes continuously",
    "build.runComment": "# Prepare the Pi runtime and launch the desktop app",
    "build.verifyComment": "# Verify readiness claims published on Pages",
    "copy.copy": "Copy",
    "copy.copied": "Copied",
    "copy.label": "Copy the fast-build command",
    "closing.title": "Turn every agent action into an engineering fact you can inspect.",
    "closing.source": "View project source",
    "footer.back": "Back to top ↑",
  },
};

const readStoredLanguage = () => {
  try {
    return localStorage.getItem(languageStorageKey);
  } catch {
    return null;
  }
};

const writeStoredLanguage = (language) => {
  try {
    localStorage.setItem(languageStorageKey, language);
  } catch {
    // The language still applies for this session when storage is unavailable.
  }
};

let activeLanguage = readStoredLanguage() === "en"
  ? "en"
  : readStoredLanguage() === "zh-CN"
    ? "zh-CN"
    : navigator.language.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : "en";

const translate = (key) => translations[activeLanguage][key] ?? translations["zh-CN"][key] ?? key;

const applyLanguage = (language, persist = true) => {
  activeLanguage = language === "en" ? "en" : "zh-CN";
  document.documentElement.lang = activeLanguage;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = translate(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = translate(element.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-content]").forEach((element) => {
    element.setAttribute("content", translate(element.dataset.i18nContent));
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    const selected = button.dataset.language === activeLanguage;
    button.setAttribute("aria-pressed", String(selected));
  });

  if (persist) writeStoredLanguage(activeLanguage);
};

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.language));
});

applyLanguage(activeLanguage, false);

const resolveRepositoryUrl = () => {
  const { hostname, pathname } = window.location;
  if (!hostname.endsWith(".github.io")) {
    return "https://github.com/asdshuaishuai/swarm-editor";
  }

  const owner = hostname.slice(0, -".github.io".length);
  const repository = pathname.split("/").filter(Boolean)[0];
  return repository
    ? `https://github.com/${owner}/${repository}`
    : `https://github.com/${owner}`;
};

document.querySelectorAll("[data-repo-link]").forEach((link) => {
  link.href = resolveRepositoryUrl();
  link.target = "_blank";
  link.rel = "noreferrer";
});

const header = document.querySelector("[data-header]");
const syncHeader = () => header?.classList.toggle("scrolled", window.scrollY > 18);
window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();

const revealElements = document.querySelectorAll(".reveal");
if (reducedMotion.matches || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.12 },
  );
  revealElements.forEach((element) => observer.observe(element));
}

const tiltStage = document.querySelector("[data-tilt]");
if (tiltStage && !reducedMotion.matches && window.matchMedia("(pointer: fine)").matches) {
  let frame = 0;
  let nextX = 0;
  let nextY = 0;

  const renderTilt = () => {
    tiltStage.style.setProperty("--tilt-x", `${nextX.toFixed(2)}deg`);
    tiltStage.style.setProperty("--tilt-y", `${nextY.toFixed(2)}deg`);
    frame = 0;
  };

  tiltStage.addEventListener("pointermove", (event) => {
    const bounds = tiltStage.getBoundingClientRect();
    const xRatio = (event.clientX - bounds.left) / bounds.width - 0.5;
    const yRatio = (event.clientY - bounds.top) / bounds.height - 0.5;
    nextX = xRatio * 3.4;
    nextY = yRatio * -2.6;
    if (!frame) frame = requestAnimationFrame(renderTilt);
  });

  tiltStage.addEventListener("pointerleave", () => {
    nextX = 0;
    nextY = 0;
    if (!frame) frame = requestAnimationFrame(renderTilt);
  });
}

const copyButton = document.querySelector("[data-copy-command]");
copyButton?.addEventListener("click", async () => {
  const command = "./scripts/fast-build.sh";
  try {
    await navigator.clipboard.writeText(command);
    copyButton.textContent = translate("copy.copied");
  } catch {
    const input = document.createElement("textarea");
    input.value = command;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    copyButton.textContent = translate("copy.copied");
  }
  window.setTimeout(() => {
    copyButton.textContent = translate("copy.copy");
  }, 1600);
});
