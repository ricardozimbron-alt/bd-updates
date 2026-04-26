'use client';

import { useState } from 'react';

export function CopyButton({
  subject,
  body,
  recipients,
  cc,
}: {
  subject: string;
  body: string;
  recipients: string[];
  cc: string[];
}) {
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);

  // Plain-text form: convert `[text](url)` into `text (url)` so the URL is
  // visible after the verb when Markdown isn't rendered.
  const plainBody = mdLinksToPlain(body);
  const plainBlock = [
    `To: ${recipients.join(', ')}`,
    cc.length ? `Cc: ${cc.join(', ')}` : null,
    `Subject: ${subject}`,
    '',
    plainBody,
  ]
    .filter((x) => x !== null)
    .join('\n');

  // HTML form: full email block with proper <a> tags so Outlook / Mail / Gmail
  // render hyperlinks on paste. Recipient line + body paragraphs.
  const htmlBlock = buildHtmlBlock({ subject, body, recipients, cc });

  async function copy() {
    try {
      // Modern path: write both formats so the receiving app picks the best.
      if (typeof window !== 'undefined' && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([htmlBlock], { type: 'text/html' }),
          'text/plain': new Blob([plainBlock], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(plainBlock);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy:', plainBlock);
    }
  }

  // Markdown helpers (intentionally not pulled into a shared module —
  // ClipboardItem support varies by browser, so the conversion stays close
  // to the consumer).

  return (
    <>
      <button type="button" className="btn" onClick={copy}>
        {copied ? 'Copied' : 'Copy to clipboard'}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => setPreview(true)}
        title="Preview the formatted block"
      >
        Preview
      </button>
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPreview(false)}
        >
          <div
            className="w-full max-w-2xl rounded border border-ink-700 bg-ink-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Outlook-ready preview</h3>
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="text-ink-400 hover:text-ink-100"
              >
                ✕
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-ink-800 bg-ink-950 p-3 font-mono text-[12px] leading-relaxed text-ink-200">
              {plainBlock}
            </pre>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="btn"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copy();
                  setPreview(false);
                }}
                className="btn btn-primary"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** "[verb](url)" → "verb (url)". Other Markdown is left as-is. */
function mdLinksToPlain(s: string): string {
  return s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tiny Markdown-link → HTML conversion. Keeps everything else as text. */
function mdLinksToHtml(s: string): string {
  // Process links first, then escape the rest. We do a tokenised pass.
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out += escapeHtml(s.slice(last, m.index));
    out += `<a href="${escapeHtml(m[2]!)}">${escapeHtml(m[1]!)}</a>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(s.slice(last));
  return out;
}

function buildHtmlBlock(args: {
  subject: string;
  body: string;
  recipients: string[];
  cc: string[];
}): string {
  const headerLines = [
    `<div><strong>To:</strong> ${escapeHtml(args.recipients.join(', '))}</div>`,
    args.cc.length
      ? `<div><strong>Cc:</strong> ${escapeHtml(args.cc.join(', '))}</div>`
      : '',
    `<div><strong>Subject:</strong> ${escapeHtml(args.subject)}</div>`,
    '<br>',
  ]
    .filter(Boolean)
    .join('');
  const paragraphs = args.body
    .split(/\n{2,}/)
    .map((p) => `<p>${mdLinksToHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  // Inline font-family hint matches the user's monospace-leaning aesthetic
  // but stays neutral enough that Outlook keeps recipient styling.
  return `<div style="font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #111;">${headerLines}${paragraphs}</div>`;
}
