import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({
    description: 'رمز حالة الـ HTTP',
    example: 400,
  })
  statusCode!: number;

  @ApiProperty({
    description: 'التوقيت الزمني لحدوث الخطأ (ISO 8601)',
    example: '2026-10-24T12:00:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'المسار الذي حدث فيه الخطأ',
    example: '/akwam/jobs',
  })
  path!: string;

  @ApiProperty({
    description: 'رسالة الخطأ أو مصفوفة من أخطاء التحقق',
    oneOf: [
      { type: 'string', example: 'كلمة البحث يجب أن تكون بين 1 و 100 حرف' },
      { type: 'array', items: { type: 'string' }, example: ['search should not be empty'] },
    ],
  })
  message!: string | string[];
}
