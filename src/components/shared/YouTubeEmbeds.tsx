import { extractYouTubeIds, extractYouTubeIdsFromMany } from '@/lib/youtube-utils';

interface Props {
  /** Single string to scan for YouTube URLs. */
  text?: string | null;
  /** Multiple strings to scan; IDs are deduped across all of them. */
  texts?: Array<string | null | undefined>;
  /** Optional label shown above the player grid. */
  label?: string;
  className?: string;
}

export function YouTubeEmbeds({ text, texts, label = 'Vídeos', className = '' }: Props) {
  const ids = texts ? extractYouTubeIdsFromMany(texts) : extractYouTubeIds(text);
  if (ids.length === 0) return null;

  return (
    <div className={`mt-4 space-y-2 ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40">
        {label} ({ids.length})
      </h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ids.map((id) => (
          <div key={id} className="relative w-full overflow-hidden rounded-md border border-white/10 bg-black" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={`https://www.youtube.com/embed/${id}`}
              title={`YouTube video ${id}`}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        ))}
      </div>
    </div>
  );
}