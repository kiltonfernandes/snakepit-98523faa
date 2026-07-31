import type { EpisodeMaterial } from '@/lib/types';

/** Every material mirrored from Pré-produção belongs in Rivaldo's Avulso tab. */
export function isRivaldoStandaloneMaterial(
  material: Pick<EpisodeMaterial, 'is_standalone' | 'preprod_pauta_id'>,
): boolean {
  return Boolean(material.is_standalone || material.preprod_pauta_id);
}
