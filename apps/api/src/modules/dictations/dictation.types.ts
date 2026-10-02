export type DictationSource = 'desktop' | 'mobile';

export type DictationInput = {
  text: string;
  originalText?: string | null;
  createdAt: number;
  durationMs: number;
  source: DictationSource;
};

export type CreateDictationInput = DictationInput & {
  id?: string;
};

export type ListDictationsInput = {
  limit: number;
  cursor?: string;
  q?: string;
};

export type DictationCursor = {
  createdAt: number;
  id: string;
};

export type DictationResponse = {
  id: string;
  text: string;
  originalText?: string;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  words: number;
  source: DictationSource | null;
};

export type DictationPage = {
  data: DictationResponse[];
  nextCursor: string | null;
};
