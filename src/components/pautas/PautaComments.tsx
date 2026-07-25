import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus, Trash2, Bold, Italic, Underline as UnderlineIcon, List as ListIcon, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface PautaComment {
  id: string;
  pauta_id: string;
  selected_text: string;
  comment_html: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  pautaId: string | null;
  /** Ref to the DOM node that contains the pauta content (selection is scoped to it). */
  containerRef: React.RefObject<HTMLElement>;
}

/**
 * Inline commenting for the pauta preview:
 * - Detects text selections inside `containerRef` and shows a floating "Comentar" button.
 * - Opens a rich-text editor (contenteditable) with basic formatting toolbar.
 * - Persists to `preprod_pauta_comments`. Rich text HTML, unlimited length.
 * - Renders the comments list as a right sidebar panel.
 */
export function PautaComments({ pautaId, containerRef }: Props) {
  const [comments, setComments] = useState<PautaComment[]>([]);
  const [popover, setPopover] = useState<{ x: number; y: number; selectedText: string } | null>(null);
  const [editor, setEditor] = useState<{ x: number; y: number; selectedText: string } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const loadComments = useCallback(async () => {
    if (!pautaId) return;
    const { data, error } = await supabase
      .from('preprod_pauta_comments' as any)
      .select('*')
      .eq('pauta_id', pautaId)
      .order('created_at', { ascending: true });
    if (error) { console.error('[comments] load', error); return; }
    setComments((data || []) as any);
  }, [pautaId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  // Highlight commented snippets in the pauta content.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const HIGHLIGHT_CLASS = 'pauta-comment-highlight';
    const apply = () => {
      // Clear previous highlights.
      container.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`).forEach((el) => {
        const parent = el.parentNode;
        if (!parent) return;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        parent.normalize();
      });
      if (!comments.length) return;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (p.closest('aside')) return NodeFilter.FILTER_REJECT; // skip sidebar
          if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const textNodes: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) textNodes.push(n as Text);
      for (const c of comments) {
        const snippet = (c.selected_text || '').trim();
        if (!snippet) continue;
        for (const tn of textNodes) {
          if (!tn.parentNode) continue;
          const idx = tn.data.indexOf(snippet);
          if (idx < 0) continue;
          const range = document.createRange();
          range.setStart(tn, idx);
          range.setEnd(tn, idx + snippet.length);
          const mark = document.createElement('mark');
          mark.className = HIGHLIGHT_CLASS;
          mark.style.backgroundColor = '#facc15';
          mark.style.color = '#0a0a0a';
          mark.style.padding = '0 2px';
          mark.style.borderRadius = '2px';
          mark.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.15)';
          try { range.surroundContents(mark); } catch { /* selection crosses boundaries, skip */ }
          break;
        }
      }
    };
    // Wait a tick so MarkdownView has rendered.
    const t = setTimeout(apply, 60);
    return () => clearTimeout(t);
  }, [comments, containerRef]);

  // Realtime updates
  useEffect(() => {
    if (!pautaId) return;
    const ch = supabase
      .channel(`preprod_pauta_comments:${pautaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preprod_pauta_comments', filter: `pauta_id=eq.${pautaId}` }, () => { loadComments(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pautaId, loadComments]);

  // Selection listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { setPopover(null); return; }
      const text = sel.toString().trim();
      if (!text) { setPopover(null); return; }
      const anchorNode = sel.anchorNode;
      const focusNode = sel.focusNode;
      if (!anchorNode || !focusNode) { setPopover(null); return; }
      if (!container.contains(anchorNode) || !container.contains(focusNode)) { setPopover(null); return; }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setPopover({ x: rect.left + rect.width / 2, y: rect.top - 8, selectedText: text });
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('selectionchange', onUp);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('selectionchange', onUp);
    };
  }, [containerRef]);

  const openEditor = () => {
    if (!popover) return;
    setEditor({ ...popover });
    setPopover(null);
    // Focus after mount
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        editorRef.current.focus();
      }
    }, 30);
  };

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  };

  const save = async () => {
    if (!editor || !pautaId) return;
    const html = editorRef.current?.innerHTML?.trim() || '';
    if (!html || html === '<br>') { toast.error('Escreva um comentário'); return; }
    const { error } = await supabase.from('preprod_pauta_comments' as any).insert({
      pauta_id: pautaId,
      selected_text: editor.selectedText.slice(0, 4000),
      comment_html: html,
    });
    if (error) { console.error('[comments] insert', error); toast.error('Erro ao salvar comentário'); return; }
    toast.success('Comentário salvo');
    setEditor(null);
    loadComments();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('preprod_pauta_comments' as any).delete().eq('id', id);
    if (error) { toast.error('Erro ao remover'); return; }
    loadComments();
  };

  if (!pautaId) return null;

  return (
    <>
      {/* Floating "Comentar" button on selection */}
      {popover && (
        <div
          className="fixed z-[100] -translate-x-1/2 -translate-y-full"
          style={{ left: popover.x, top: popover.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Button size="sm" className="h-8 gap-1 shadow-lg" onClick={openEditor}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> Comentar
          </Button>
        </div>
      )}

      {/* Rich text editor popover */}
      {editor && (
        <div
          className="fixed z-[110] w-[420px] max-w-[92vw] rounded-lg border border-border bg-popover shadow-2xl p-3 -translate-x-1/2"
          style={{ left: editor.x, top: Math.min(editor.y + 12, window.innerHeight - 320) }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Comentando trecho</div>
          <div className="mb-2 line-clamp-2 border-l-2 border-primary/60 pl-2">
            <mark className="bg-yellow-400 text-neutral-900 px-1 py-0.5 rounded text-xs italic">{editor.selectedText}</mark>
          </div>
          <div className="flex items-center gap-1 mb-2 border-b border-border pb-2">
            <Button size="icon" variant="ghost" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><UnderlineIcon className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}><ListIcon className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => {
              const url = window.prompt('URL do link:');
              if (url) exec('createLink', url);
            }}><LinkIcon className="h-3.5 w-3.5" /></Button>
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="min-h-[120px] max-h-[240px] overflow-y-auto rounded border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring prose prose-sm dark:prose-invert max-w-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button>
            <Button size="sm" onClick={save}>Salvar comentário</Button>
          </div>
        </div>
      )}

      {/* Sidebar with existing comments */}
      <aside className="fixed right-4 top-16 bottom-4 w-[320px] z-[60] hidden lg:flex flex-col rounded-lg border border-border bg-card/95 backdrop-blur shadow-xl">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comentários</div>
          <div className="text-[10px] text-muted-foreground">{comments.length}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {comments.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">Selecione um trecho da pauta para comentar.</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-md border border-border bg-background p-2 text-xs space-y-1.5 group">
                <div className="border-l-2 border-primary/60 pl-2 line-clamp-3">
                  <mark className="bg-yellow-400 text-neutral-900 px-1 py-0.5 rounded italic">{c.selected_text}</mark>
                </div>
                <div className="prose prose-xs max-w-none text-white [&_*]:text-white [&_*]:text-xs" dangerouslySetInnerHTML={{ __html: c.comment_html }} />
                <div className="flex items-center justify-between pt-1">
                  <div className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}</div>
                  <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}