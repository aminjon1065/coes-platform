import { IsDateString, IsString, MinLength } from 'class-validator';

/** File a deadline extension request for a task (§4.10). */
export class RequestDeadlineExtensionDto {
  /** The new deadline being requested — must be after the current deadline */
  @IsDateString()
  requestedDeadline: string;

  /** Mandatory justification — must be substantive (min 20 chars) */
  @IsString()
  @MinLength(20)
  justification: string;
}
