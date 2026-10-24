import {
  Controller,
  Post,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBody,
  ApiCookieAuth,
  ApiBadRequestResponse,
  ApiTooManyRequestsResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { UserRateLimitGuard } from '../../queue/user-rate-limit.guard';
import { RateLimit } from '../../queue/rate-limit.decorator';
import { sanitizeSearchText } from '../../application/validators/sanitization.util';
import { ErrorResponseDto } from '../../application/dtos/error-response.dto';
import { SyncSearchUseCase } from '../../application/use-cases/sync-search.use-case';

@ApiTags('legacy')
@Controller('akwam')
export class AkwamLegacyController {
  constructor(private readonly syncSearchUseCase: SyncSearchUseCase) {}

  @ApiOperation({
    summary: '[قديم وموقوف تدريجياً] البحث التزامني المباشر (Synchronous Search)',
    description:
      '⚠️ **ملاحظة:** يوصى باستخدام نمط المهام غير التزامني `POST /akwam/jobs` في واجهات المستخدم.\n\n' +
      'يقوم هذا المسار بتنفيذ دورة البحث والاستخراج كاملة في طلب HTTP واحد ينتظر حتى اكتمال جلب جميع روابط الأفلام والمسلسلات.\n' +
      'يدعم استلام كلمة البحث عبر Query String (`?search=...`) أو عبر JSON Body (`{ "search": "..." }`).',
    deprecated: true,
  })
  @ApiCookieAuth('access_queue')
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'العنوان المطلوب البحث عنه في الموقع (عبر Query param)',
    example: 'Inception',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        search: { type: 'string', example: 'Inception' },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'مصفوفة النتائج بالصيغة القديمة: [["Movies", ...], ["Series", ...]]',
  })
  @ApiBadRequestResponse({
    description: 'كلمة البحث مفقودة أو غير صالحة',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'تجاوز حد الطلبات المسموح به لكل عنوان IP',
    type: ErrorResponseDto,
  })
  @Post()
  @UseGuards(UserRateLimitGuard)
  @RateLimit({ scope: 'jobs' })
  async searchDirect(
    @Query('search') querySearch?: string,
    @Body('search') bodySearch?: string,
  ) {
    return this.handleSearch(querySearch, bodySearch);
  }

  @Post('search')
  @UseGuards(UserRateLimitGuard)
  @RateLimit({ scope: 'jobs' })
  async searchWithSubpath(
    @Query('search') querySearch?: string,
    @Body('search') bodySearch?: string,
  ) {
    return this.handleSearch(querySearch, bodySearch);
  }

  private async handleSearch(querySearch?: string, bodySearch?: string) {
    const raw = querySearch || bodySearch || '';
    const sanitized = sanitizeSearchText(raw);
    if (!sanitized || sanitized.length === 0) {
      throw new BadRequestException(
        'يجب توفير كلمة البحث عبر ?search=... أو عبر Body { "search": "..." }',
      );
    }
    return this.syncSearchUseCase.execute(sanitized);
  }
}
