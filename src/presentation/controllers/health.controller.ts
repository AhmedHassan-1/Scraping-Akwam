import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { RedisService } from '../../redis/redis.service';
import { HealthResponseDto } from '../../application/dtos/health-response.dto';

@ApiTags('utils')
@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @ApiOperation({
    summary: 'فحص صحة النظام وقاعدة البيانات (System Health Check)',
    description:
      'يتحقق من جاهزية السيرفر والاتصال الحي السحابي بـ Upstash Redis ومدة تشغيل التطبيق.',
  })
  @ApiOkResponse({
    description: 'حالة الخادم وقاعدة البيانات',
    type: HealthResponseDto,
  })
  @Get()
  async check(): Promise<HealthResponseDto> {
    let redisStatus = 'disconnected';
    try {
      const pong = await this.redis.client.ping();
      redisStatus = pong === 'PONG' ? 'connected' : pong;
    } catch (err: any) {
      redisStatus = `error: ${err.message}`;
    }

    return {
      status: 'ok',
      redis: redisStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
