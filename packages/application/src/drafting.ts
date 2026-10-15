import type { ProjectOpportunity } from '@fvh/domain';

export type DraftingEvidence = { label: string; source: string; content: string };
export type ProfileFact = { label: string; value: string; source: string };
export type DraftingInput = {
  project: ProjectOpportunity;
  profileFacts: ProfileFact[];
  evidence: DraftingEvidence[];
  profileRate: { min: number; max: number };
  score: number;
};
export type DraftingOutput = {
  proposal: string;
  proposedPrice: number;
  durationDays: number;
  confidence: number;
  evidence: Array<{ label: string; source: string }>;
  assumptions: string[];
};

export interface AiDraftingPort {
  draftBid(input: DraftingInput): Promise<DraftingOutput>;
}

export class UnavailableDraftingAdapter implements AiDraftingPort {
  async draftBid(): Promise<DraftingOutput> {
    throw new Error('Hermes drafting is not configured or data processing consent is not enabled.');
  }
}

export class FixtureDraftingAdapter implements AiDraftingPort {
  async draftBid(input: DraftingInput): Promise<DraftingOutput> {
    const { project, profileFacts, evidence, profileRate, score } = input;
    const midpoint = Math.round((project.budgetMin + project.budgetMax) / 2);
    const proposedPrice = Math.min(profileRate.max, Math.max(profileRate.min, midpoint));
    const scope = project.description.split(/[.!?]/)[0]?.trim() || project.title;
    const proposal = [
      `Saya tertarik membantu ${project.title}.`,
      `Dari brief, fokus awalnya adalah ${scope}. Saya akan memecah pekerjaan menjadi langkah kecil, menguji tiap bagian, lalu menyerahkan ringkasan perubahan dan cara verifikasinya.`,
      profileFacts.length ? `Fakta profil yang tersedia: ${profileFacts.map((fact) => `${fact.label}: ${fact.value}`).join('; ')}.` : 'Saya belum menambahkan klaim pengalaman karena belum ada fakta profil bersumber yang disimpan.',
      evidence.length ? `Sumber kerja yang relevan untuk ditinjau: ${evidence.map((item) => item.label).join(', ')}.` : '',
      'Sebelum mulai, saya akan mengonfirmasi akses, kriteria selesai, dan detail yang belum disebutkan pada brief.',
    ].filter(Boolean).join('\n\n');
    return {
      proposal,
      proposedPrice,
      durationDays: Math.min(Math.max(1, project.deadlineDays), 10),
      confidence: Math.min(0.95, Math.max(0.5, 0.58 + project.briefQuality * 0.22 + (score / 100) * 0.14)),
      evidence: [
        ...profileFacts.map(({ label, source }) => ({ label, source })),
        ...evidence.map(({ label, source }) => ({ label, source })),
      ],
      assumptions: ['Harga awal dihitung dari titik tengah anggaran contoh dan harus disesuaikan dengan kebijakan aktif.'],
    };
  }
}
