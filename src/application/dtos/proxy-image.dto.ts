import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl, MaxLength, Matches } from 'class-validator';

export class ProxyImageDto {
  @ApiProperty({
    description: 'رابط الصورة من النطاقات المصرح بها لموقع أكوام (بروتوكول HTTPS حصراً، وبحد أقصى 1024 حرف)',
    example: 'https://img.downet.net/thumb/178x260/uploads/ZMBmF.jpeg',
    maxLength: 1024,
  })
  @IsNotEmpty({ message: 'رابط الصورة مطلوب' })
  @MaxLength(1024, { message: 'طول رابط الصورة يجب ألا يتجاوز 1024 حرف' })
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: true },
    { message: 'رابط الصورة يجب أن يكون رابط HTTPS صالحاً ومعتمداً' },
  )
  @Matches(/^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?(\/.*)?$/, {
    message: 'صيغة رابط الصورة غير مقبولة أمنياً',
  })
  url!: string;
}
