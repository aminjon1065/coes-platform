import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTaskTypeDto } from './create-task-type.dto';

/** Update an existing TaskType (task_admin only). §17.1 */
export class UpdateTaskTypeDto extends PartialType(CreateTaskTypeDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
