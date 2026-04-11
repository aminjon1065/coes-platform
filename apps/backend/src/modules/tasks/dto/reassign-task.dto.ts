import { IsUUID, IsString, MaxLength, IsOptional } from 'class-validator';

/** Reassign the primary responsible position of a task (§6.5). */
export class ReassignTaskDto {
  /** The new primary responsible position */
  @IsUUID()
  newPositionId: string;

  /** Mandatory reason for the reassignment — stored permanently in task history */
  @IsString()
  @MaxLength(500)
  reason: string;

  /** Optional: snapshot of the new occupant at reassignment time */
  @IsOptional()
  @IsString()
  newUserId?: string;
}
