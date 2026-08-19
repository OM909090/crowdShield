import { memo } from "react";

/**
 * Markdown — the small subset of Markdown the assistant is allowed to emit,
 * rendered as React elements.
 *
 * Why hand-rolled instead of react-markdown: the backend prompt pins the model
 * to a deliberately narrow subset (bold, italic, inline code, bullet and
 * numbered lists, `###` labels, blockquotes, rules, links). Supporting exactly
 * that is ~150 lines, versus adding react-markdown + remark to the bundle for
 * chat bubbles. It also means no HTML ever reaches the DOM: this returns React
 * elements only, never dangerouslySetInnerHTML, so a model that echoes a
 * `<script>` from user input renders it as visible text instead of running it.
 *
 * Streaming-safe: an unterminated `**` simply renders as the literal characters
 * until its closing pair arrives, so a half-streamed reply never flickers into
 * broken markup or loses text.
 */

/* ------------------------------------------------------------------ *
 * Inline
 * ------------------------------------------------------------------ */

/**
 * **bold** | *italic* | `code` | [label](href)
 *
 * A FACTORY, not a shared instance, and this is not a style choice.
 * `parseInline` recurses to handle nested marks like **bold with *italic* inside**.
 * A `/g` regex carries mutable `lastIndex` state, so a shared one meant the inner
 * call rewound the scan to 0, the outer `while` restarted from the beginning of the
 * string, matched the same text again, recursed again — an infinite loop that froze
 * the browser tab. Since the prompt asks the model to bold every place name, it
 * fired on almost every reply.
 */
const inlineRegex = () => /\*\*([^*]+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`|\[([^\]\n]+?)\]\(([^)\s]+?)\)/g;

/** Only ever produce links we are willing to navigate to. */
function safeHref(raw) {
  const href = String(raw || "").trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:/i.test(href)) return href;
  // In-app route (the assistant may point at /citizen, /settings, …).
  if (/^\/[\w\-/?=&#.]*$/.test(href)) return href;
  return null;
}

/**
 * Turn one line of text into React nodes, recursing so `**bold with *italic***`
 * works. Anything that isn't a complete token stays literal text.
 */
function parseInline(text, keyBase = "i") {
  const out = [];
  let last = 0;
  let n = 0;

  // An instance local to THIS call, so a recursive call cannot rewind our scan
  // position. See the note on inlineRegex.
  const re = inlineRegex();
  let m;
  while ((m = re.exec(text)) !== null) {
    // A zero-length match would never advance and would spin forever.
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${n++}`;

    const [, bold, italic, code, label, href] = m;
    if (bold !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-white">
          {parseInline(bold, key)}
        </strong>
      );
    } else if (italic !== undefined) {
      out.push(
        <em key={key} className="italic text-slate-200">
          {parseInline(italic, key)}
        </em>
      );
    } else if (code !== undefined) {
      out.push(
        <code
          key={key}
          className="rounded bg-cyan-400/10 px-1 py-px font-mono text-[0.92em] text-cyan-200"
        >
          {code}
        </code>
      );
    } else if (label !== undefined) {
      const url = safeHref(href);
      out.push(
        url ? (
          <a
            key={key}
            href={url}
            target={url.startsWith("/") ? undefined : "_blank"}
            rel={url.startsWith("/") ? undefined : "noreferrer noopener"}
            className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 transition hover:text-cyan-200"
          >
            {parseInline(label, key)}
          </a>
        ) : (
          // Refused scheme (javascript:, data:, …) — show the words, drop the link.
          <span key={key}>{parseInline(label, key)}</span>
        )
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ------------------------------------------------------------------ *
 * Blocks
 * ------------------------------------------------------------------ */

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_RE = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const RULE_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Group consecutive lines into blocks, then render each. */
function renderBlocks(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const nodes = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — block separator.
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Horizontal rule (checked before bullets so "---" isn't a list item).
    if (RULE_RE.test(line)) {
      nodes.push(<hr key={`hr${k++}`} className="my-2.5 border-white/10" />);
      i += 1;
      continue;
    }

    // Heading. The prompt asks for ### only; deeper/shallower still renders
    // readably rather than leaking hashes into the bubble.
    const heading = line.match(HEADING_RE);
    if (heading) {
      const big = heading[1].length <= 2;
      nodes.push(
        <p
          key={`h${k++}`}
          className={`mt-2.5 font-bold text-white first:mt-0 ${big ? "text-[0.95rem]" : "text-[0.875rem]"}`}
        >
          {parseInline(heading[2], `h${k}`)}
        </p>
      );
      i += 1;
      continue;
    }

    // Bullet list.
    if (BULLET_RE.test(line)) {
      const items = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].match(BULLET_RE)[1]);
        i += 1;
      }
      nodes.push(
        <ul key={`ul${k++}`} className="my-1.5 list-disc space-y-1 pl-4 marker:text-cyan-400/80">
          {items.map((item, idx) => (
            <li key={idx} className="pl-0.5">
              {parseInline(item, `ul${k}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list.
    if (ORDERED_RE.test(line)) {
      const items = [];
      const start = Number(line.match(ORDERED_RE)[1]) || 1;
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(lines[i].match(ORDERED_RE)[2]);
        i += 1;
      }
      nodes.push(
        <ol
          key={`ol${k++}`}
          start={start}
          className="my-1.5 list-decimal space-y-1 pl-4 marker:font-semibold marker:text-cyan-400/80"
        >
          {items.map((item, idx) => (
            <li key={idx} className="pl-0.5">
              {parseInline(item, `ol${k}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote — consecutive "> " lines fold into one.
    if (QUOTE_RE.test(line)) {
      const parts = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        parts.push(lines[i].match(QUOTE_RE)[1]);
        i += 1;
      }
      nodes.push(
        <blockquote
          key={`bq${k++}`}
          className="my-1.5 border-l-2 border-cyan-400/40 pl-2.5 text-slate-300"
        >
          {parseInline(parts.join(" "), `bq${k}`)}
        </blockquote>
      );
      continue;
    }

    // Paragraph — consecutive plain lines, kept as separate visual lines so a
    // model that writes one fact per line still reads as one fact per line.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !RULE_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    nodes.push(
      <p key={`p${k++}`} className="my-1 first:mt-0 last:mb-0">
        {para.map((l, idx) => (
          <span key={idx}>
            {idx > 0 && <br />}
            {parseInline(l, `p${k}-${idx}`)}
          </span>
        ))}
      </p>
    );
  }

  return nodes;
}

function Markdown({ children }) {
  return <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{renderBlocks(children)}</div>;
}

export default memo(Markdown);
