/**
 * Normalises a filesystem path string the way users actually paste them.
 *
 * Handles the common copy/paste foibles on Windows + Powershell:
 *   - "C:\Users\me\Docs\SOW.docx"   (Right-click → Copy as path)
 *   - 'C:\Users\me\Docs\SOW.docx'   (Powershell drag-and-drop)
 *   - “C:\Users\me\Docs\SOW.docx”   (smart-quoted paste from chat / email)
 *   - Trailing punctuation that comes along when copying from a chat
 *
 * Returns the cleaned path. Does NOT touch path separators or
 * existence — that's the caller's job.
 */
export function cleanPathString(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  // Strip up to a few layers of surrounding matching quotes (e.g. user
  // wrapped a quoted path in another quote pair while editing).
  for (let i = 0; i < 3; i++) {
    const stripped = stripWrappingQuotes(s);
    if (stripped === s) break;
    s = stripped.trim();
  }

  // Trailing junk that sometimes rides along when you grab a path out
  // of a sentence ("see SOW.docx," or "open SOW.docx."). Keep it
  // conservative — only strip a single trailing comma / semicolon /
  // closing bracket.
  s = s.replace(/[,;\])]+$/u, "").trim();

  return s;
}

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["\"", "\""],
  ["'", "'"],
  ["`", "`"],
  ["\u201C", "\u201D"], // “ ”
  ["\u2018", "\u2019"], // ‘ ’
  ["\u00AB", "\u00BB"], // « »
];

function stripWrappingQuotes(s: string): string {
  if (s.length < 2) return s;
  const first = s[0]!;
  const last = s[s.length - 1]!;
  for (const [open, close] of QUOTE_PAIRS) {
    if (first === open && last === close) {
      return s.slice(1, -1);
    }
  }
  return s;
}
