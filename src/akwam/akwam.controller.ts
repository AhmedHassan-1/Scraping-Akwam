import {
  Controller,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AkwamService } from './akwam.service';

@Controller('akwam')
export class AkwamController {
  constructor(private readonly akwamService: AkwamService) {}

  /**
   * POST /akwam?search=<query>
   * يقوم بالبحث عن أفلام ومسلسلات وإرجاع النتائج بصيغة JSON
   */
  @Post()
  async search(@Query('search') search: string) {
    if (!search || search.trim() === '') {
      throw new BadRequestException('يجب توفير كلمة البحث عبر query param: ?search=...');
    }

    const results = await this.akwamService.getResults(search.trim());
    return results;
  }
}
