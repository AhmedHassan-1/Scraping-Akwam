import {
  Controller,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiCookieAuth,
  ApiBadRequestResponse,
  ApiTooManyRequestsResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { UserRateLimitGuard } from '../../queue/user-rate-limit.guard';
import { SyncSearchDto } from '../../application/dtos/sync-search.dto';
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
      'يقوم هذا المسار بتنفيذ دورة البحث والاستخراج كاملة في طلب HTTP واحد ينتظر حتى اكتمال جلب جميع روابط الأفلام والمسلسلات.',
    deprecated: true,
  })
  @ApiCookieAuth('access_queue')
  @ApiQuery({
    name: 'search',
    required: true,
    description: 'العنوان المطلوب البحث عنه في الموقع (عربي أو إنجليزي)',
    example: 'Inception',
  })
  @ApiCreatedResponse({
    description: 'مصفوفة النتائج بالصيغة القديمة: [["Movies", ...], ["Series", ...]]',
    schema: {
      example: [
        [
          'Movies',
          {
            Title: 'Inception',
            Image: 'https://img.downet.net/uploads/ZMBmF.jpeg',
            Rating: '10 / 8.8 PG13 اشراف عائلي',
            Lang: 'اللغة : الإنجليزية',
            Quality: 'جودة الفيلم : BluRay - 1080p',
            Year: 'السنة :  2010',
            Country: 'انتاج :  الولايات المتحدة الأمريكية',
            Time: 'مدة الفيلم : 152 دقيقة',
            Information: ['خيال علمي', 'مغامرة', 'اكشن'],
            '1080p': 'https://akwam.ss/download/7057/562/inception-1',
            '1080p_': '2.7 GB',
            '720p': 'https://akwam.ss/download/7056/562/inception-1',
            '720p_': '1.4 GB',
            '480p': 'https://akwam.ss/download/7055/562/inception-1',
            '480p_': '727.2 MB',
          },
        ],
      ],
    },
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
  async search(@Query() dto: SyncSearchDto) {
    return this.syncSearchUseCase.execute(dto.search);
  }
}
