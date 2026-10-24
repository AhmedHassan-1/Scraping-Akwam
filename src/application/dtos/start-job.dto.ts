import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export class StartJobDto {
  @ApiProperty({
    description: 'مصفوفة معرفات العناصر المختارة للمعالجة (الحد الأدنى 1 والحد الأقصى 20 عنصر بدون تكرار)',
    example: [0, 2],
    type: [Number],
  })
  @IsArray({ message: 'العناصر المختارة يجب أن تكون مصفوفة' })
  @ArrayMinSize(1, { message: 'يجب اختيار عنصر واحد على الأقل للمعالجة' })
  @ArrayMaxSize(20, { message: 'الحد الأقصى للعناصر المختارة في طلب واحد هو 20 عنصراً' })
  @ArrayUnique({ message: 'لا يمكن تكرار نفس معرف العنصر أكثر من مرة' })
  @IsInt({ each: true, message: 'معرفات العناصر يجب أن تكون أرقاماً صحيحة' })
  @Min(0, { each: true, message: 'معرفات العناصر يجب أن تكون أرقاماً موجبة تبدأ من 0' })
  @Max(1000, { each: true, message: 'معرف العنصر خارج النطاق المسموح به' })
  selectedIds!: number[];
}
