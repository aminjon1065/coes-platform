import { IsUUID, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { AssignmentType } from '../entities/task-assignment.entity';

export class AddExecutorDto {
  @IsUUID()
  positionId: string;

  @IsOptional()
  @IsEnum(AssignmentType)
  assignmentType?: AssignmentType;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}
