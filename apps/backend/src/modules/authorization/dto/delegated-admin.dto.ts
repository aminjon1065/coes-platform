import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsDateString,
  IsArray,
} from 'class-validator';

export class GrantDeptRoleDto {
  /** The user to grant the role to */
  @IsUUID()
  targetUserId: string;

  /** Role to grant (must not be a system-level role) */
  @IsUUID()
  roleId: string;

  /** Optional expiry — defaults to no expiry */
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class RevokeDeptRoleDto {
  /** The assignment ID to revoke */
  @IsUUID()
  assignmentId: string;
}

export class CreateDeptWorkflowTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  documentTypeId: string;

  @IsArray()
  steps: Array<{
    stepOrder: number;
    name: string;
    roleId?: string;
    requiredActions: string[];
  }>;
}
