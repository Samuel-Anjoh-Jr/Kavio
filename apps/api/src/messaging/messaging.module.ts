import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { MessagingController } from './messaging.controller';
import { MessagingNotificationListener } from './messaging-notification.listener';
import { MessagingReadService } from './messaging-read.service';
import { MessagingResolver } from './messaging.resolver';
import { MessagingService } from './messaging.service';

/**
 * Messaging (PROMPT 70; SRS §13, MSG-01, MSG-02, MSG-04).
 *
 * Writes are REST (MessagingController), reads are GraphQL (MessagingResolver) —
 * the DUAL API RULE. The WS gateway that fans messages, typing and presence to
 * open sockets (PROMPT 71) lives in RealtimeModule, which imports this module for
 * MessagingService; keeping it there avoids a module cycle. StorageModule
 * resolves the signed URLs for private message media on read.
 */
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    MessagingReadService,
    MessagingResolver,
    MessagingNotificationListener,
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
