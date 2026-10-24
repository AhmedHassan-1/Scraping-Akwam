import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeSearchText } from '../validators/sanitization.util';

export class CreateJobDto {
  @ApiProperty({
    description: 'العنوان المطلوب البحث عنه في موقع أكوام (1 - 100 حرف، معقم ضد ثغرات XSS والرموز الخبيثة)',
    example: 'Inception',
    minLength: 1,
    maxLength: 100,
  })
  @Transform(({ value }) => sanitizeSearchText(value))
  @IsString({ message: 'كلمة البحث يجب أن تكون نصاً صالحاً' })
  @IsNotEmpty({ message: 'يجب توفير كلمة البحث' })
  @Length(1, 100, { message: 'كلمة البحث يجب أن تكون بين 1 و 100 حرف' })
  @Matches(/^[^\0<>]+$/, { message: 'كلمة البحث تحتوي على رموز غير مسموح بها' })
  search!: string;
}
