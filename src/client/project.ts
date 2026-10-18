/**
 * A project page's two controls: the install box's tabs, and a copy button on
 * every command.
 *
 * The page works without this. The build lists every install method one under
 * the other and renders no buttons at all; this script hides all but one method
 * behind the tablist, and adds the copy buttons, so a control only exists where
 * something will answer it.
 */

const box = document.querySelector<HTMLElement>("[data-install]");
const tablist = box?.querySelector<HTMLElement>("[role=tablist]");

if (box && tablist) {
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const panels = [...box.querySelectorAll<HTMLElement>("[role=tabpanel]")];

  const select = (index: number, focus = false) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
      (panels[i] as HTMLElement).hidden = !on;
    });
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(i));
    // Arrow keys move between tabs, as the WAI-ARIA tabs pattern expects.
    tab.addEventListener("keydown", (event) => {
      const step =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      select((i + step + tabs.length) % tabs.length, true);
    });
  });

  box.classList.add("tabbed");
  tablist.hidden = false;
  select(0);
}

/** A copy button on each command, in the install box and in the README. */
function addCopy(pre: HTMLElement) {
  if (!navigator.clipboard) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  button.textContent = "copy";
  button.addEventListener("click", () => {
    navigator.clipboard.writeText(pre.innerText.trimEnd()).then(
      () => {
        button.textContent = "copied";
        setTimeout(() => {
          button.textContent = "copy";
        }, 1600);
      },
      () => {
        button.textContent = "select it";
      },
    );
  });
  // A box of its own, so the button can sit in the block's corner.
  const wrap = document.createElement("div");
  wrap.className = "has-copy";
  pre.replaceWith(wrap);
  wrap.append(pre, button);
}

// Commands only: a transcript (`$ nethound` and its output) is for reading.
for (const pre of document.querySelectorAll<HTMLElement>(
  ".install pre, .readme pre:has(> code[class^='language-'])",
)) {
  addCopy(pre);
}
