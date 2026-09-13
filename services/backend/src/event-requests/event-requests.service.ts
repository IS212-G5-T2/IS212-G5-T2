import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EventRequestsRepository } from './event-requests.repository.js';
import { parseSaveDraft, uuidPattern } from './dto/save-draft.dto.js';
import type { DraftWorkspace } from './draft-workspace.js';

@Injectable()
export class EventRequestsService {
  constructor(@Inject(EventRequestsRepository) private readonly repository: EventRequestsRepository) {}
  private checkId(id: string) { if (!uuidPattern.test(id)) throw new BadRequestException('Invalid request ID.'); }
  list(user: DraftWorkspace) { return this.repository.list(user); }
  get(id: string, user: DraftWorkspace) { this.checkId(id); return this.repository.get(id, user); }
  save(id: string, body: unknown, user: DraftWorkspace) {
    this.checkId(id);
    return this.repository.save(id, parseSaveDraft(body), user);
  }
}
