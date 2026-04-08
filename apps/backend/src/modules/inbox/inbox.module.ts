import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboxMessage } from './entities/inbox-message.entity';
import { InboxService } from './services/inbox.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([InboxMessage])],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
