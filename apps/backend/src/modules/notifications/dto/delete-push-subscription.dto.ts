import { IsString, IsUrl } from 'class-validator';

export class DeletePushSubscriptionDto {
  @IsString()
  @IsUrl({ require_tld: false }, { message: 'endpoint must be a valid URL' })
  endpoint: string;
}
