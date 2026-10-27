import type { MessageAnalysisOutput } from '@fvh/contracts';

export type MessageAnalysisInput = {
  threadId: string;
  messageId: string;
  projectTitle: string | null;
  completeness: 'complete' | 'truncated';
  completenessReason: string | null;
  /** Exact message text as stored in the snapshot; never the 200-character preview. */
  body: string;
};

/** Writes a reply draft only. Approval, sending and pricing stay outside the model. */
export interface AiMessageAnalysisPort {
  analyzeMessage(input: MessageAnalysisInput): Promise<MessageAnalysisOutput>;
}

export class UnavailableMessageAnalysisAdapter implements AiMessageAnalysisPort {
  async analyzeMessage(): Promise<MessageAnalysisOutput> {
    throw new Error('Analisis pesan AI tidak tersedia: Hermes belum aktif atau persetujuan data belum diberikan.');
  }
}
