/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { describe, it, expect } from "vitest";
import {
  splitContentSections,
  buildSectionDocs,
} from "../src/utils/search-sections";
import { compileMarkdown } from "../src/compile-markdown";
import type { DocsConfig } from "../src/types";

const h = (level: number, slug: string, text: string) =>
  `<h${level} id="${slug}" class="scroll-mt-20">${text}<a class="header-anchor" href="#${slug}" aria-label="Link to this section">#</a></h${level}>`;

describe("splitContentSections", () => {
  it("captures intro text before the first heading", () => {
    const html = `<p>Intro paragraph.</p>${h(2, "one", "One")}<p>Body one.</p>`;
    const sections = splitContentSections(html);
    expect(sections).toEqual([
      { slug: "", title: "", level: 0, text: "Intro paragraph." },
      { slug: "one", title: "One", level: 2, text: "Body one." },
    ]);
  });

  it("splits at h1-h3 and folds h4+ into the enclosing section", () => {
    const html =
      h(1, "top", "Top") +
      "<p>a</p>" +
      h(2, "s2", "S2") +
      "<p>b</p>" +
      `<h4 id="deep" class="scroll-mt-20">Deep</h4><p>c</p>` +
      h(3, "s3", "S3") +
      "<p>d</p>";
    const sections = splitContentSections(html);
    expect(sections.map((s) => s.slug)).toEqual(["top", "s2", "s3"]);
    expect(sections[1].text).toBe("b Deep c");
    expect(sections[2]).toMatchObject({ level: 3, title: "S3", text: "d" });
  });

  it("strips the header-anchor from the section title", () => {
    const sections = splitContentSections(h(2, "x", "My <code>API</code>"));
    expect(sections[0].title).toBe("My API");
  });

  it("keeps headings with empty bodies but drops an empty intro", () => {
    const html = "  \n" + h(2, "only", "Only");
    const sections = splitContentSections(html);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ slug: "only", text: "" });
  });

  it("decodes entities and collapses whitespace", () => {
    const html =
      h(2, "e", "A &amp; B") +
      "<p>x &lt;tag&gt;\n   &quot;q&quot; &#39;s&#39;</p>";
    const sections = splitContentSections(html);
    expect(sections[0].title).toBe("A & B");
    expect(sections[0].text).toBe(`x <tag> "q" 's'`);
  });

  it("keeps code text but not mermaid attribute payloads", () => {
    const html =
      h(2, "c", "Code") +
      `<div class="codeblock" data-lang="ts"><pre class="shiki"><code>const answer = 42;</code></pre></div>` +
      `<div class="mermaid-block" data-mermaid="${encodeURIComponent("flowchart TD\n SECRETNODE")}"></div>`;
    const sections = splitContentSections(html);
    expect(sections[0].text).toContain("const answer = 42;");
    expect(sections[0].text).not.toContain("SECRETNODE");
  });

  it("round-trips real compiler output", async () => {
    const config: DocsConfig = { docs: "docs", baseUrl: "/", title: "T" };
    const source =
      "# Page\n\nintro text\n\n## Alpha\n\nalpha body\n\n### Beta\n\nbeta body\n\n#### Gamma\n\ngamma body\n";
    const module = await compileMarkdown(source, {
      config,
      filePath: "docs/t.md",
    });
    const html = JSON.parse(
      module.match(/export const contentHtml = ("(?:[^"\\]|\\.)*");/)![1],
    ) as string;

    const sections = splitContentSections(html);
    expect(sections.map((s) => [s.slug, s.title])).toEqual([
      ["page", "Page"],
      ["alpha", "Alpha"],
      ["beta", "Beta"],
    ]);
    expect(sections[0].text).toBe("intro text");
    expect(sections[1].text).toBe("alpha body");
    // h4 folds into the h3 section.
    expect(sections[2].text).toBe("beta body Gamma gamma body");
    // Anchor "#" must not leak into titles.
    expect(sections.every((s) => !s.title.includes("#"))).toBe(true);
  });
});

describe("buildSectionDocs", () => {
  const page = (contentHtml: string) => ({
    title: "CSS",
    link: "/site/css",
    excerpt: "fallback excerpt",
    contentHtml,
  });

  it("builds hierarchical crumbs from h1/h2 ancestry", () => {
    const html =
      h(1, "css", "CSS") +
      "<p>intro</p>" +
      h(2, "layout", "Layout") +
      "<p>a</p>" +
      h(3, "bfc", "BFC") +
      "<p>b</p>" +
      h(2, "colors", "Colors") +
      "<p>c</p>" +
      h(3, "oklch", "OKLCH") +
      "<p>d</p>";
    const docs = buildSectionDocs([page(html)]);

    expect(docs.map((d) => [d.title, d.crumb, d.link])).toEqual([
      ["CSS", "", "/site/css#css"],
      ["Layout", "CSS", "/site/css#layout"],
      ["BFC", "CSS › Layout", "/site/css#bfc"],
      ["Colors", "CSS", "/site/css#colors"],
      ["OKLCH", "CSS › Colors", "/site/css#oklch"],
    ]);
  });

  it("dedupes page title against a distinct h1 in the crumb", () => {
    const html =
      h(1, "intro-h1", "Getting Started") +
      h(2, "install", "Install") +
      "<p>x</p>";
    const docs = buildSectionDocs([page(html)]);
    // h2 crumb includes both the page title and the differing h1.
    expect(docs[1].crumb).toBe("CSS › Getting Started");
  });

  it("h3 without a preceding h2 falls back to page/h1 ancestry", () => {
    const html = h(1, "top", "CSS") + h(3, "deep", "Deep") + "<p>x</p>";
    const docs = buildSectionDocs([page(html)]);
    expect(docs[1].crumb).toBe("CSS");
  });

  it("falls back to a single page-level doc when there are no sections", () => {
    const docs = buildSectionDocs([page("<p>plain body only</p>")]);
    expect(docs).toEqual([
      {
        id: 0,
        title: "CSS",
        pageTitle: "CSS",
        crumb: "",
        link: "/site/css",
        text: "plain body only",
      },
    ]);
  });

  it("assigns globally unique incrementing ids across pages", () => {
    const docs = buildSectionDocs([
      page(h(2, "a", "A") + "<p>1</p>"),
      { ...page(h(2, "b", "B") + "<p>2</p>"), link: "/site/other" },
    ]);
    expect(docs.map((d) => d.id)).toEqual([0, 1]);
    expect(docs[1].link).toBe("/site/other#b");
  });
});
