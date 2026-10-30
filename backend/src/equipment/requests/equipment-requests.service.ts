import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/types/auth.models.js';
import { EquipmentRequestsRepository } from './equipment-requests.repository.js';
import { validateEquipmentRequest } from './dto/equipment-request-input.js';

/* v8 ignore start -- Nest decorator metadata is not executable service behavior. */
@Injectable()
/* v8 ignore stop */
/** Applies role checks and request validation before equipment request persistence. */
export class EquipmentRequestsService {
  constructor(private readonly repository: EquipmentRequestsRepository) {}

  async submit(user: AuthenticatedUser | undefined, body: unknown) {
    const coordinator = this.coordinator(user);
    const result = await this.repository.submit(coordinator.uid, validateEquipmentRequest(body));
    if (result.kind === 'event-not-assigned') throw new NotFoundException('Assigned event not found.');
    if (result.kind === 'event-not-open') throw new ConflictException('This event is not open for equipment requests.');
    if (result.kind === 'already-submitted') throw new ConflictException('An equipment request already exists for this event. Update the existing request instead.');
    return { ...result, requestReference: `ER-${result.id.replaceAll('-', '').slice(0, 8).toUpperCase()}` };
  }

  async update(user: AuthenticatedUser | undefined, requestId: string, body: unknown) {
    const coordinator = this.coordinator(user);
    const result = await this.repository.update(coordinator.uid, requestId, validateEquipmentRequest(body));
    if (result.kind === 'request-not-found') throw new NotFoundException('Equipment request not found.');
    if (result.kind === 'request-reserved') throw new ConflictException('Reserved equipment requests cannot be updated.');
    if (result.kind === 'event-confirmed') throw new ConflictException('Equipment requests cannot be updated after the event is confirmed.');
    if (result.kind === 'event-not-open') throw new ConflictException('This event is not open for equipment requests.');
    return { ...result, requestReference: `ER-${result.id.replaceAll('-', '').slice(0, 8).toUpperCase()}` };
  }

  async listMine(user: AuthenticatedUser | undefined) {
    return this.repository.listMine(this.coordinator(user).uid);
  }

  async listEligibleEvents(user: AuthenticatedUser | undefined) {
    return this.repository.listEligibleEvents(this.coordinator(user).uid);
  }

  async listQueue(user: AuthenticatedUser | undefined) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required.');
    if (!user.roles.includes('TECH_SUPPORT')) throw new ForbiddenException('Technical Support access required.');
    return this.repository.listQueue();
  }

  /** SPM-58 AC7: the technical-support reservation view is not browser-local state. */
  async listReservations(user: AuthenticatedUser | undefined) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required.');
    if (!user.roles.includes('TECH_SUPPORT')) throw new ForbiddenException('Technical Support access required.');
    return this.repository.listReservations();
  }

  /** SPM-113: only Technical Support can approve/reserve a pending request. */
  async reserve(user: AuthenticatedUser | undefined, requestId: string) {
    if (!user?.uid) throw new UnauthorizedException('Authentication required.');
    if (!user.roles.includes('TECH_SUPPORT')) throw new ForbiddenException('Technical Support access required.');
    const result = await this.repository.reserve(requestId);
    if (result.kind === 'request-not-found') throw new NotFoundException('Equipment request not found.');
    if (result.kind === 'event-confirmed') throw new ConflictException('Equipment requests cannot be changed after the event is confirmed.');
    if (result.kind === 'not-pending') throw new ConflictException('Only Pending Review equipment requests can be reserved.');
    if (result.kind === 'insufficient-active-stock') {
      throw new ConflictException(`Not enough active equipment is available to reserve ${result.equipmentName}.`);
    }
    return { ...result, requestReference: `ER-${result.id.replaceAll('-', '').slice(0, 8).toUpperCase()}` };
  }


  private coordinator(user: AuthenticatedUser | undefined): AuthenticatedUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required.');
    if (!user.roles.includes('COORDINATOR')) throw new ForbiddenException('Coordinator access required.');
    return user;
  }
}
