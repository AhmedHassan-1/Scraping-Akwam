import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl, MaxLength, Matches } from 'class-validator';

export class StreamVideoDto {
  @ApiProperty({
    description: 'رابط ملف الفيديو المباشر من سيرفرات التوزيع المعتمدة لموقع أكوام',
    example: 'https://s301d3.downet.net/download/1792999494/6addaec66a796/Inception.2010.480p.BluRay.AKWAM.mp4',
    maxLength: 2048,
  })
  @IsNotEmpty({ message: 'رابط الفيديو مطلوب' })
  @MaxLength(2048, { message: 'طول رابط الفيديو يجب ألا يتجاوز 2048 حرف' })
  @IsUrl(
    { protocols: ['https', 'http'], require_protocol: true, require_tld: true },
    { message: 'رابط الفيديو يجب أن يكون رابطاً صالحاً' },
  )
  @Matches(/^https?:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?(\/.*)?$/, {
    message: 'صيغة رابط الفيديو غير مقبولة أمنياً',
  })
  url!: string;
}
