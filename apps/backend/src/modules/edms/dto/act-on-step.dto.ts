import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { WorkflowStepAction } from '../entities/workflow-step.entity';

export class ActOnStepDto {
  @IsEnum(WorkflowStepAction)
  action: WorkflowStepAction;

  /** Formal remarks attached to this action */
  @IsOptional()
  @IsString()
  remarks?: string;

  /**
   * For RETURNED actions: which step to return to.
   * If omitted, uses the step definition's returnToStep or returns to author.
   */
  @IsOptional()
  @IsString()
  returnToStep?: string;

  /** Delegation ID if acting under delegation */
  @IsOptional()
  @IsUUID()
  delegationId?: string;
}
