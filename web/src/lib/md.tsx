/**
 * Tiny inline Markdown renderer. Just enough for assistant replies — bold,
 * italic, inline code, fenced code blocks, links, paragraphs and bullet
 * lists. Pulling in `react-markdown` for this would be heavyweight.
 */
import { Fragment, type ReactNode } from 'react';

export function MD({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'code') {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded border border-ink-800 bg-ink-950 p-2 font-mono text-[12px] text-ink-200"
            >
              {b.body}
            </pre>
          );
        }
        if (b.type === 'list') {
          return (
            <ul key={i} className="list-inside list-disc space-y-1 pl-2">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === 'heading') {
          return (
            <p key={i} className="font-semibold text-ink-100">
              {renderInline(b.body)}
            </p>
          );
        }
        // paragraph
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(b.body)}
          </p>
        );
      })}
    </div>
  );
}

type Block =
  | { type: 'paragraph'; body: string }
  | { type: 'heading'; level: 1 | 2 | 3; body: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; body: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // code fence
    if (/^```/.test(line)) {
      const acc: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) {
        acc.push(lines[i]!);
        i++;
      }
      i++;
      blocks.push({ type: 'code', body: acc.join('\n') });
      continue;
    }
    // heading
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      blocks.push({
        type: 'heading',
        level: h[1]!.length as 1 | 2 | 3,
        body: h[2]!,
      });
      i++;
      continue;
    }
    // list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    // blank
    if (line.trim() === '') {
      i++;
      continue;
    }
    // paragraph (collect until blank / structural)
    const acc: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^```/.test(lines[i]!) &&
      !/^(#{1,3})\s+/.test(lines[i]!) &&
      !/^\s*[-*]\s+/.test(lines[i]!)
    ) {
      acc.push(lines[i]!);
      i++;
    }
    blocks.push({ type: 'paragraph', body: acc.join('\n') });
  }
  return blocks;
}

function renderInline(s: string): ReactNode {
  // tokens in order: code, bold, italic, link
  const out: ReactNode[] = [];
  let rest = s;
  let key = 0;
  while (rest.length > 0) {
    const m =
      /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/.exec(
        rest,
      );
    if (!m) {
      out.push(<Fragment key={key++}>{rest}</Fragment>);
      break;
    }
    if (m.index > 0) {
      out.push(<Fragment key={key++}>{rest.slice(0, m.index)}</Fragment>);
    }
    const tok = m[0];
    if (tok.startsWith('`')) {
      out.push(
        <code
          key={key++}
          className="rounded bg-ink-900 px-1 py-0.5 font-mono text-[12px]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**')) {
      out.push(
        <strong key={key++} className="font-semibold text-ink-100">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      out.push(
        <em key={key++} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    } else if (tok.startsWith('[')) {
      const linkM = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(
        <a
          key={key++}
          href={linkM[2]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-400 hover:underline"
        >
          {linkM[1]}
        </a>,
      );
    }
    rest = rest.slice(m.index + tok.length);
  }
  return <>{out}</>;
}
