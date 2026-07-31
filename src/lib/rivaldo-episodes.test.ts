import { describe, expect, it } from 'vitest';
import type { EpisodeMaterial } from './types';
import type { PreprodPauta } from './preprod-calendar';
import { buildRivaldoPreprodGroups, isRivaldoStandaloneMaterial } from './rivaldo-episodes';

describe('isRivaldoStandaloneMaterial', () => {
  it('places every Pré-produção mirror in Avulso even when the legacy flag is absent', () => {
    expect(isRivaldoStandaloneMaterial({ is_standalone: false, preprod_pauta_id: 'preprod-1' })).toBe(true);
  });

  it('keeps weekly materials in Série', () => {
    expect(isRivaldoStandaloneMaterial({ is_standalone: false, preprod_pauta_id: null })).toBe(false);
  });

  it('lists every Pré-produção entry even without an episode_materials mirror', () => {
    const pautas = [
      {
        id: 'edu',
        publication_date: '2026-07-29',
        kind: 'review',
        status: 'ready',
        data: { selected_title: 'Resenha: Edu Falaschi - Mi’raj: O álbum mais maduro dos 35 anos de Edu Falaschi 💥' },
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
      {
        id: 'news',
        publication_date: '2026-07-30',
        kind: 'news',
        status: 'draft',
        data: { title: 'Notícia da semana' },
        created_at: '2026-07-02T00:00:00Z',
        updated_at: '2026-07-02T00:00:00Z',
      },
    ] satisfies PreprodPauta[];

    const groups = buildRivaldoPreprodGroups(pautas, []);

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].items.map((item) => item.id)).toEqual(['edu', 'news']);
    expect(groups[0].items[0].searchText).toContain('edu falaschi');
  });

  it('groups by Monday week and keeps entries already uploaded to OneDrive', () => {
    const pautas = [
      {
        id: 'older',
        publication_date: '2026-07-26',
        kind: 'review',
        status: 'ready',
        data: { title: 'Semana anterior' },
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
      {
        id: 'uploaded',
        publication_date: '2026-07-27',
        kind: 'review',
        status: 'ready',
        data: { title: 'Já enviado' },
        created_at: '2026-07-02T00:00:00Z',
        updated_at: '2026-07-02T00:00:00Z',
      },
    ] satisfies PreprodPauta[];
    const materials = [{
      id: 'material-uploaded',
      preprod_pauta_id: 'uploaded',
      repository_url: 'https://example.com/audio.mp3',
    }] as EpisodeMaterial[];

    const groups = buildRivaldoPreprodGroups(pautas, materials);

    expect(groups.map((group) => group.weekId)).toEqual(['2026-07-27', '2026-07-20']);
    expect(groups[0].items[0]).toMatchObject({
      id: 'uploaded',
      materialId: 'material-uploaded',
      repositoryUrl: 'https://example.com/audio.mp3',
    });
  });
});
