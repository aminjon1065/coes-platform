import { IsEnum, IsString, IsOptional, MinLength } from 'class-validator';
import { TaskExtensionStatus } from '../entities/task-deadline-extension-request.entity';

/** Approve or deny a deadline extension request (§4.10). */
export class ReviewDeadlineExtensionDto {
  @IsEnum([TaskExtensionStatus.APPROVED, TaskExtensionStatus.DENIED])
  decision: TaskExtensionStatus.APPROVED | TaskExtensionStatus.DENIED;

  /** Required when denying — must explain why the extension is not granted */
  @IsOptional()
  @IsString()
  @MinLength(10)
  remarks?: string;
}
