import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/auth.decorators';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Unauthenticated root banner — auth is deny-by-default, so this opts out. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
