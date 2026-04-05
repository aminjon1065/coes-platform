import {
  IsString, IsOptional, IsEnum, IsUUID, IsArray, ValidateNested, IsInt, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType } from '../entities/message.entity';

export class AttachmentDto {
  @IsUUID()
  fileId: string;

  @IsString()
  fileName: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  fileSizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;
}

export class SendMessageDto {
  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  /** Threading: reply to this message */
  @IsOptional()
  @IsUUID()
  parentMessageId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  classification?: number;

  /** Client idempotency key for at-most-once send */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
