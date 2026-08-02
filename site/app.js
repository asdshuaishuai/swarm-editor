document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const resolveRepositoryUrl = () => {
  const { hostname, pathname } = window.location;
  if (!hostname.endsWith(".github.io")) {
    return "https://gitee.com/skyRules/d2x-editer";
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
    copyButton.textContent = "已复制";
  } catch {
    const input = document.createElement("textarea");
    input.value = command;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    copyButton.textContent = "已复制";
  }
  window.setTimeout(() => {
    copyButton.textContent = "复制";
  }, 1600);
});
