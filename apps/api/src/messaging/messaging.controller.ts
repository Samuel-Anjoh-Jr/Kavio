import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../auth/decorators/auth.decorators';
import { ZodValidationPipe } from '../lib/zod-validation.pipe';
import {
  blockUserSchema,
  reportSchema,
  sendMessageSchema,
  startConversationSchema,
  type BlockUserDto,
  type ReportDto,
  type SendMessageDto,
  type StartConversationDto,
} from './dto/message.dto';
import { MessagingService } from './messaging.service';

/**
 * Messaging WRITES (REST, per the DUAL API RULE; MSG-01, MSG-04). Reads are on
 * MessagingResolver.
 *
 * Starting a conversation and sending a message require `message:send` — the
 * capability every trading role holds. Blocking and reporting need only a valid
 * session: they are safety actions, and gating them behind a trade capability
 * would leave, say, an Agent unable to report abuse.
 */
@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('message:send')
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startConversationSchema)) dto: StartConversationDto,
  ) {
    return this.messaging.startConversation(user, dto);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('message:send')
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(user, id, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.messaging.markRead(user, id);
  }

  @Post('messaging/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(blockUserSchema)) dto: BlockUserDto,
  ) {
    return this.messaging.blockUser(user, dto);
  }

  @Delete('messaging/block/:userId')
  @HttpCode(HttpStatus.OK)
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.messaging.unblockUser(user, userId);
  }

  @Post('messaging/report')
  @HttpCode(HttpStatus.CREATED)
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reportSchema)) dto: ReportDto,
  ) {
    return this.messaging.report(user, dto);
  }
}
