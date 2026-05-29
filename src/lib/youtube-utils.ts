/**
 * Extracts unique YouTube video IDs from arbitrary text.
 * Supports youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/.
 */
const YT_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s&]*&)*v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gi;

export function extractYouTubeIds(input: string | null | undefined): string[] {
  if (!input) return [];
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  YT_REGEX.lastIndex = 0;
  while ((match = YT_REGEX.exec(input)) !== null) {
    if (match[1]) ids.add(match[1]);
  }
  return Array.from(ids);
}

export function extractYouTubeIdsFromMany(inputs: Array<string | null | undefined>): string[] {
  const ids = new Set<string>();
  for (const s of inputs) {
    for (const id of extractYouTubeIds(s)) ids.add(id);
  }
  return Array.from(ids);
}