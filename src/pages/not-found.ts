import type { Content } from "../content.ts";
import { html } from "../html.ts";
import { type Assets, documentHead, footer, topBarHome } from "../partials.ts";

export function notFoundPage(content: Content, assets: Assets): string {
  const { site } = content;
  return String(
    html`${documentHead({
      site,
      assets,
      title: "Not found — micheldev.com",
      description: "That page does not exist.",
      path: "/404",
      locale: "en",
      robots: "noindex",
      scripts: [assets.theme],
    })}
    ${topBarHome()}
    <main id="main">
      <div class="wrap">
        <section class="miss">
          <p class="eyebrow">404</p>
          <h1>Nothing here</h1>
          <p class="thesis">
            That URL does not exist. The <a href="/">homepage</a> has everything,
            and the <a href="/cv">CV</a> is the other page worth your time.
          </p>
        </section>
      </div>
    </main>
    ${footer(site)}`,
  );
}
