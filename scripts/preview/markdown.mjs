/**
 * Minimal GFM renderer for the committed audit reports.
 *
 * The reports are the source of truth and stay Markdown in the repository. This
 * turns them into static HTML at build time so the published preview needs no
 * runtime JavaScript and no network call. It covers exactly the constructs the
 * reports use — ATX headings, fenced code, GFM tables, ordered and unordered
 * lists, blockquotes, horizontal rules, paragraphs, and inline code, emphasis,
 * links and autolinks — and escapes everything else.
 *
 * Unknown constructs degrade to escaped text rather than raw HTML, so a report
 * can never inject markup into the published site.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** GitHub-compatible heading anchor. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Rewrites a relative Markdown link so it works from the published page. */
function resolveHref(href, linkBase, resolveLink) {
  if (/^https?:\/\//.test(href) || href.startsWith('#') || href.startsWith('mailto:')) return href;
  if (resolveLink) return resolveLink(href);
  if (!linkBase) return href;
  const clean = href.replace(/^\.\//, '').replace(/\.md(?=#|$)/, '.html');
  return `${linkBase}${clean}`;
}

function inline(text, opts) {
  const { linkBase = '', resolveLink } = opts ?? {};
  // Pull code spans out first so their contents are never treated as markup.
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = escapeHtml(out);

  // Links: [label](target)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const resolved = resolveHref(href, linkBase, resolveLink);
    const external = /^https?:\/\//.test(resolved);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escapeHtml(resolved)}"${attrs}>${label}</a>`;
  });

  // Bare autolinks.
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, url) => {
    return `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

const isTableSeparator = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

export function renderMarkdown(source, options = {}) {
  const { linkBase = '', idPrefix = '', resolveLink } = options;
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const headings = [];
  let i = 0;
  const para = [];

  const flushParagraph = () => {
    if (!para.length) return;
    // GitHub renders a single newline inside a paragraph as a hard break, so
    // match it rather than reflowing the author's line wrapping.
    html.push(`<p>${para.map((l) => inline(l, { linkBase, resolveLink })).join('<br />\n')}</p>`);
    para.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    // ---- fenced code
    const fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      flushParagraph();
      const marker = fence[1];
      const lang = fence[2].trim();
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // ---- blank line
    if (!line.trim()) {
      flushParagraph();
      i += 1;
      continue;
    }

    // ---- heading
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const text = heading[2];
      const id = idPrefix + slugify(text);
      if (level <= 3) headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inline(text, { linkBase, resolveLink })}</h${level}>`);
      i += 1;
      continue;
    }

    // ---- horizontal rule
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      flushParagraph();
      html.push('<hr />');
      i += 1;
      continue;
    }

    // ---- table
    if (line.trim().startsWith('|') && isTableSeparator(lines[i + 1] ?? '')) {
      flushParagraph();
      const head = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      const thead = head.map((c) => `<th>${inline(c, { linkBase, resolveLink })}</th>`).join('');
      const tbody = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c, { linkBase, resolveLink })}</td>`).join('')}</tr>`)
        .join('');
      html.push(
        `<div class="table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`,
      );
      continue;
    }

    // ---- blockquote
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${renderMarkdown(quote.join('\n'), options).html}</blockquote>`);
      continue;
    }

    // ---- list
    const bullet = line.match(/^\s*([-*+])\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items = [];
      while (i < lines.length) {
        const m = isOrdered
          ? lines[i].match(/^\s*\d+[.)]\s+(.*)$/)
          : lines[i].match(/^\s*[-*+]\s+(.*)$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      const body = items.map((it) => `<li>${inline(it, { linkBase, resolveLink })}</li>`).join('');
      html.push(`<${tag}>${body}</${tag}>`);
      continue;
    }

    // ---- paragraph text
    para.push(line.trim());
    i += 1;
  }

  flushParagraph();
  return { html: html.join('\n'), headings };
}
