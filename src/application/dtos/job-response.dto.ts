import { ApiProperty } from '@nestjs/swagger';

export class SearchCandidateDto {
  @ApiProperty({
    description: 'المعرف الرقمي للعنصر ضمن نتائج البحث',
    example: 0,
  })
  id!: number;

  @ApiProperty({
    description: 'عنوان الفيلم أو المسلسل',
    example: 'Inception',
  })
  title!: string;

  @ApiProperty({
    description: 'رابط صورة الغلاف أو البوستر',
    example: 'https://img.downet.net/thumb/178x260/uploads/ZMBmF.jpeg',
  })
  image!: string;

  @ApiProperty({
    description: 'رابط صفحة العمل على موقع أكوام',
    example: 'https://akwam.ss/movie/562/inception-1',
  })
  url!: string;
}

export class DownloadQualityDto {
  @ApiProperty({
    description: 'اسم الجودة (1080p, 720p, 480p, etc.)',
    example: '1080p',
  })
  quality!: string;

  @ApiProperty({
    description: 'رابط التحميل المباشر المستخرج بعد فك التوجيه',
    example: 'https://akwam.ss/download/7057/562/inception-1',
  })
  downloadUrl!: string;

  @ApiProperty({
    description: 'حجم ملف التحميل',
    example: '2.7 GB',
  })
  size!: string;
}

export class EpisodeDto {
  @ApiProperty({
    description: 'عنوان الحلقة',
    example: 'الحلقة 1',
  })
  title!: string;

  @ApiProperty({
    description: 'جودات وروابط التحميل المتاحة للحلقة',
    type: [DownloadQualityDto],
  })
  qualities!: DownloadQualityDto[];
}

export class MovieDto {
  @ApiProperty({ description: 'اسم الفيلم', example: 'Inception' })
  title!: string;

  @ApiProperty({ description: 'رابط صورة البوستر', example: 'https://img.downet.net/uploads/ZMBmF.jpeg' })
  image!: string;

  @ApiProperty({ description: 'التقييم والتصنيف العمري', example: '10 / 8.8 PG13 اشراف عائلي' })
  rating!: string;

  @ApiProperty({ description: 'لغة العرض والترجمة', example: 'اللغة : الإنجليزية' })
  language!: string;

  @ApiProperty({ description: 'جودة العمل المصدرية', example: 'جودة الفيلم : BluRay - 1080p' })
  quality!: string;

  @ApiProperty({ description: 'سنة الإنتاج', example: 'السنة :  2010' })
  year!: string;

  @ApiProperty({ description: 'بلد الإنتاج', example: 'انتاج :  الولايات المتحدة الأمريكية' })
  country!: string;

  @ApiProperty({ description: 'مدة العرض بالدقائق', example: 'مدة الفيلم : 152 دقيقة' })
  duration!: string;

  @ApiProperty({ description: 'تصنيفات العمل والنوع الفني', example: ['خيال علمي', 'مغامرة', 'اكشن'] })
  information!: string[];

  @ApiProperty({ description: 'جودات التحميل المباشرة وروابطها', type: [DownloadQualityDto] })
  qualities!: DownloadQualityDto[];
}

export class SeriesDto {
  @ApiProperty({ description: 'اسم المسلسل', example: 'Breaking Bad' })
  title!: string;

  @ApiProperty({ description: 'رابط صورة البوستر', example: 'https://img.downet.net/uploads/bb.jpeg' })
  image!: string;

  @ApiProperty({ description: 'التقييم', example: '10 / 9.5' })
  rating!: string;

  @ApiProperty({ description: 'اللغة', example: 'اللغة : الإنجليزية' })
  language!: string;

  @ApiProperty({ description: 'الجودة', example: 'WEB-DL - 1080p' })
  quality!: string;

  @ApiProperty({ description: 'السنة', example: '2008' })
  year!: string;

  @ApiProperty({ description: 'البلد', example: 'الولايات المتحدة' })
  country!: string;

  @ApiProperty({ description: 'مدة العرض', example: 'مسلسل' })
  duration!: string;

  @ApiProperty({ description: 'التصنيف', example: ['دراما', 'جريمة'] })
  information!: string[];

  @ApiProperty({ description: 'قائمة الحلقات وروابط تحميلها', type: [EpisodeDto] })
  episodes!: EpisodeDto[];
}

export class ProgressStateDto {
  @ApiProperty({
    description: 'المرحلة الحالية للعملية',
    enum: ['queue', 'discover', 'item', 'detail', 'item_done'],
    example: 'item_done',
  })
  phase!: 'queue' | 'discover' | 'item' | 'detail' | 'item_done';

  @ApiProperty({
    description: 'رسالة نصية تصف حالة التقدم للمستخدم باللغة العربية',
    example: 'اكتمل البحث واستخراج جميع الروابط',
  })
  message!: string;

  @ApiProperty({
    description: 'رقم الخطوة الحالية',
    example: 1,
  })
  current!: number;

  @ApiProperty({
    description: 'إجمالي عدد الخطوات المطلوبة',
    example: 1,
  })
  total!: number;

  @ApiProperty({
    description: 'عدد العناصر التي اكتملت معالجتها بالكامل',
    required: false,
    example: 1,
  })
  completedItems?: number;
}

export class JobSnapshotDto {
  @ApiProperty({
    description: 'المعرف الفريد للمهمة (UUID v4)',
    example: '7c3ad391-0442-4118-ad7b-0d3dfe8851c5',
  })
  id!: string;

  @ApiProperty({
    description: 'نص البحث المطلوب',
    example: 'Inception',
  })
  search!: string;

  @ApiProperty({
    description: 'حالة المهمة الحالية في دورة الحياة',
    enum: [
      'queued',
      'discovering',
      'awaiting_selection',
      'processing',
      'completed',
      'failed',
      'cancelled',
    ],
    example: 'completed',
  })
  status!: string;

  @ApiProperty({
    description: 'قائمة الأعمال المكتشفة من الموقع المطابقة لنص البحث',
    type: [SearchCandidateDto],
  })
  candidates!: SearchCandidateDto[];

  @ApiProperty({
    description: 'المعرفات المختارة للمعالجة بواسطة المستخدم',
    example: [0],
  })
  selectedIds!: number[];

  @ApiProperty({
    description: 'حالة وتقدم التنفيذ الحالية للمهمة',
    type: ProgressStateDto,
  })
  progress!: ProgressStateDto;

  @ApiProperty({
    description: 'بيانات وتفاصيل الأفلام المعالجة',
    type: [MovieDto],
  })
  movies!: MovieDto[];

  @ApiProperty({
    description: 'بيانات وتفاصيل المسلسلات والحلقات المعالجة',
    type: [SeriesDto],
  })
  series!: SeriesDto[];

  @ApiProperty({
    description: 'النتائج النهائية المتوافقة مع النمط القديم',
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
        },
      ],
    ],
  })
  results!: any[];

  @ApiProperty({
    description: 'رسالة الخطأ في حال فشل المهمة',
    required: false,
    example: null,
  })
  error?: string;

  @ApiProperty({
    description: 'موقع المهمة في طابور الانتظار (0 تعني أنها قيد التشغيل)',
    example: 0,
  })
  queuePosition!: number;

  @ApiProperty({
    description: 'إجمالي عدد المهام المنتظرة في الطابور',
    example: 0,
  })
  queueTotal!: number;

  @ApiProperty({
    description: 'عدد المهام التي تسبق هذه المهمة في الطابور',
    example: 0,
  })
  queueAhead!: number;

  @ApiProperty({
    description: 'الأولوية المسندة للمهمة من السيرفر (100 للأدمن، 10 للمستخدم العادي)',
    example: 10,
  })
  priority!: number;

  @ApiProperty({
    description: 'هل تخطت المهمة الطابور العادي عبر كوكي الأدمن؟',
    example: false,
  })
  bypassedQueue!: boolean;

  @ApiProperty({
    description: 'تاريخ إنشاء المهمة (Unix Timestamp)',
    example: 1792840455021,
  })
  createdAt!: number;

  @ApiProperty({
    description: 'تاريخ آخر تحديث للمهمة (Unix Timestamp)',
    example: 1792840663930,
  })
  updatedAt!: number;
}
