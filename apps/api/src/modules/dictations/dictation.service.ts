import { ApiError } from '../../shared/errors/api-error';
import { createDictationRepository } from './dictation.repository';
import type {
  CreateDictationInput,
  DictationInput,
  DictationPage,
  DictationResponse,
  ListDictationsInput,
} from './dictation.types';
import {
  decodeCursor,
  encodeCursor,
  isUniqueConstraintError,
  toDictationResponse,
  toNewDictation,
} from './dictation.utils';

export function createDictationService(database: D1Database) {
  const repository = createDictationRepository(database);

  return {
    async list(userId: string, input: ListDictationsInput): Promise<DictationPage> {
      const cursor = input.cursor ? decodeCursor(input.cursor) : null;
      if (input.cursor && !cursor) {
        throw new ApiError(400, 'invalid_cursor', 'The cursor is invalid.');
      }

      const rows = await repository.findPage({
        userId,
        limit: input.limit,
        cursor,
        query: input.q,
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const last = page.at(-1);

      return {
        data: page.map(toDictationResponse),
        nextCursor:
          hasMore && last
            ? encodeCursor({ createdAt: last.createdAt.getTime(), id: last.id })
            : null,
      };
    },

    async get(userId: string, id: string): Promise<DictationResponse> {
      const row = await repository.findById(userId, id);
      if (!row) throw new ApiError(404, 'not_found', 'Dictation not found.');
      return toDictationResponse(row);
    },

    async create(userId: string, input: CreateDictationInput): Promise<DictationResponse> {
      const values = toNewDictation(userId, input.id ?? crypto.randomUUID(), input);

      try {
        return toDictationResponse(await repository.insert(values));
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ApiError(409, 'already_exists', 'A dictation with this ID already exists.');
        }
        throw error;
      }
    },

    async upsert(
      userId: string,
      id: string,
      input: DictationInput,
    ): Promise<{ data: DictationResponse; created: boolean }> {
      const existing = await repository.findOwner(id);
      if (existing && existing.userId !== userId) {
        throw new ApiError(404, 'not_found', 'Dictation not found.');
      }

      const saved = await repository.upsert(toNewDictation(userId, id, input));
      return { data: toDictationResponse(saved), created: !existing };
    },

    async remove(userId: string, id: string): Promise<void> {
      const deleted = await repository.remove(userId, id);
      if (deleted.length === 0) {
        throw new ApiError(404, 'not_found', 'Dictation not found.');
      }
    },

    async removeAll(userId: string): Promise<number> {
      const deleted = await repository.removeAll(userId);
      return deleted.length;
    },
  };
}
