import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    description: 'حالة الخادم العامة',
    example: 'ok',
  })
  status!: string;

  @ApiProperty({
    description: 'حالة الاتصال بقاعدة بيانات Redis',
    example: 'connected',
  })
  redis!: string;

  @ApiProperty({
    description: 'مدة تشغيل الخادم بالثواني (Uptime)',
    example: 125.45,
  })
  uptime!: number;

  @ApiProperty({
    description: 'التوقيت الحالي للخادم (ISO 8601)',
    example: '2026-10-24T12:00:00.000Z',
  })
  timestamp!: string;
}
