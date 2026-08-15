/**
 * A very small tagged-template layer for building HTML.
 *
 * The whole point is that interpolation escapes by default: `${value}` is safe,
 * and anything that should carry markup has to say so explicitly via `raw()`.
 * That keeps the YAML-sourced `*_html` fields the only place markup can enter,
 * and makes them findable with a grep.
 */

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c] as string);
}

/** Marks a string as already-safe markup, exempting it from escaping. */
class Raw {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function raw(value: string): Raw {
  return new Raw(value);
}

export type Renderable =
  | Raw
  | string
  | number
  | null
  | undefined
  | false
  | Renderable[];

function render(value: Renderable): string {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (typeof value === "number") return String(value);
  return escapeHtml(value);
}

export function html(
  strings: TemplateStringsArray,
  ...values: Renderable[]
): Raw {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    out += render(values[i]) + (strings[i + 1] ?? "");
  }
  return new Raw(out);
}

/** Joins renderables with a separator, escaping each. */
export function join(items: Renderable[], separator = ""): Raw {
  return new Raw(items.map(render).join(separator));
}

/**
 * Turns a multi-line YAML string into `<br>`-separated markup, unescaped.
 *
 * Used for the short marginal notes in the section rails, where the line breaks
 * are a typographic choice made in the content file rather than a wrapping
 * accident. A note may also carry markup — a link, say — which is why the key is
 * `note_html`: a content file edited a few times a year is better off with one
 * rule than with two keys that look the same and behave differently.
 *
 * The `Html` in the name is the contract: only `*_html` YAML keys reach this, so
 * every place markup can enter a page is still one grep away.
 */
export function htmlLines(value: string): Raw {
  return new Raw(
    value
      .trimEnd()
      .split("\n")
      .map((line) => line.trim())
      .join("<br>"),
  );
}
