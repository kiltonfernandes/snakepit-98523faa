/**
 * Guardrails for LLM markdown output.
 *
 * LLMs frequently wrap their entire response in a code fence
 * (```markdown ... ``` or ``` ... ```), or in triple-single-quote blocks.
 * That makes the whole pauta render as a single <pre> block instead of
 * proper markdown. This helper strips an outer wrapper when it clearly
 * encloses the full payload, while preserving inner fenced code blocks.
 */
export function sanitizeMarkdownOutput(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = String(raw).replace(/^\uFEFF/, '').trim();
  if (!text) return '';

  // 1) Triple-backtick wrapper.  ```[lang]\n...\n```
  const tripleBacktick = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```\s*$/;
  const mB = text.match(tripleBacktick);
  if (mB) text = mB[1].trim();

  // 2) Triple single-quote wrapper.  '''[lang]\n...\n'''
  const tripleSingle = /^'''[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n'''\s*$/;
  const mS = text.match(tripleSingle);
  if (mS) text = mS[1].trim();

  // 3) Triple double-quote wrapper.  """...""" (rare but possible)
  const tripleDouble = /^"""[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n"""\s*$/;
  const mD = text.match(tripleDouble);
  if (mD) text = mD[1].trim();

  // 4) Stray solitary fence at very start/end (no closing or no opening pair).
  text = text.replace(/^```[a-zA-Z0-9_-]*\s*\n/, '');
  text = text.replace(/\n```\s*$/, '');

  return text.trim();
}