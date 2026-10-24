import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiProduces,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { UserRateLimitGuard } from '../../queue/user-rate-limit.guard';
import { RateLimit } from '../../queue/rate-limit.decorator';
import { ProxyImageDto } from '../../application/dtos/proxy-image.dto';
import { ErrorResponseDto } from '../../application/dtos/error-response.dto';
import { ProxyImageUseCase } from '../../application/use-cases/proxy-image.use-case';

@ApiTags('utils')
@Controller('akwam')
export class AkwamProxyController {
  constructor(private readonly proxyImageUseCase: ProxyImageUseCase) {}

  @ApiOperation({
    summary: 'بروكسي جلب صور البوسترات الآمن (Safe Image Proxy)',
    description:
      'يجلب صورة بوستر العمل من سيرفرات موقع أكوام المعتمدة ويعيد بثها للعميل لحل مشاكل CORS ومنع الـ Hotlinking.\n\n' +
      '**ميزات الحماية والأداء:**\n' +
      '- 🛡️ **SSRF Protection:** قائمة بيضاء صارمة تشمل فقط نطاقات أكوام المصرحة (`ak.sv`, `img.ak.sv`, `akwam.ss`, `img.downet.net`).\n' +
      '- 🛑 **Anti-Redirect:** إيقاف تتبع الـ Redirects لمنع استهداف الشبكات الداخلية أو Cloud Metadata (`169.254.169.254`).\n' +
      '- 📏 **Size Limit:** حد أقصى لحجم الصورة 5 ميجابايت.\n' +
      '- ⚡ **Redis Cache:** تخزين الصورة في Upstash Redis لمدة 24 ساعة لتقليل الضغط وسرعة الاستجابة.\n' +
      '- 📦 **Browser Cache-Control:** ترويسة كاش للمتصفح لمدة يوم كامل (`max-age=86400`).\n' +
      '- 🚦 **Dedicated Image Rate Limiting:** محدد سرعة منفصل للصور بمعدل 150 صورة/دقيقة لا يؤثر على مهام البحث.',
  })
  @ApiQuery({
    name: 'url',
    required: true,
    description: 'رابط الصورة المباشر من نطاقات موقع أكوام المصرحة',
    example: 'https://img.downet.net/thumb/178x260/uploads/ZMBmF.jpeg',
  })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  @ApiOkResponse({
    description: 'ملف الصورة الثنائي الأصلي (Binary Image Data)',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiBadRequestResponse({
    description: 'رابط الصورة غير مسموح به، أو خارج النطاق المصرح، أو ليس صورة صالحة',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'تعذر جلب الصورة من الخادم المصدر',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'تجاوز حد جلب الصور المسموح به لكل عنوان IP (150 صورة/دقيقة)',
    type: ErrorResponseDto,
  })
  @Get('proxy-image')
  @UseGuards(UserRateLimitGuard)
  @RateLimit({ scope: 'images' })
  async proxyImage(@Query() dto: ProxyImageDto, @Res() res: Response) {
    const { buffer, contentType } = await this.proxyImageUseCase.execute(dto.url);
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(buffer);
  }
}
