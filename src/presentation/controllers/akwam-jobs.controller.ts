import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Sse,
  UseGuards,
  Req,
  Inject,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiCookieAuth,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Observable, map } from 'rxjs';
import { UserRateLimitGuard } from '../../queue/user-rate-limit.guard';
import { RateLimit } from '../../queue/rate-limit.decorator';
import { CreateJobDto } from '../../application/dtos/create-job.dto';
import { StartJobDto } from '../../application/dtos/start-job.dto';
import { JobSnapshotDto } from '../../application/dtos/job-response.dto';
import { ErrorResponseDto } from '../../application/dtos/error-response.dto';
import { CreateJobUseCase } from '../../application/use-cases/create-job.use-case';
import { GetJobSnapshotUseCase } from '../../application/use-cases/get-job-snapshot.use-case';
import { StartProcessingUseCase } from '../../application/use-cases/start-processing.use-case';
import { CancelJobUseCase } from '../../application/use-cases/cancel-job.use-case';
import { IJobRepository } from '../../core/interfaces/job-repository.interface';
import { IQueueProvider } from '../../core/interfaces/queue-provider.interface';

@ApiTags('jobs')
@Controller('akwam/jobs')
export class AkwamJobsController {
  constructor(
    private readonly createJobUseCase: CreateJobUseCase,
    private readonly getJobSnapshotUseCase: GetJobSnapshotUseCase,
    private readonly startProcessingUseCase: StartProcessingUseCase,
    private readonly cancelJobUseCase: CancelJobUseCase,
    @Inject('IJobRepository')
    private readonly jobRepository: IJobRepository,
    @Inject('IQueueProvider')
    private readonly queueProvider: IQueueProvider,
  ) {}

  @ApiOperation({
    summary: 'إنشاء مهمة بحث جديدة (Create Search Job)',
    description:
      'يبدأ مرحلة استكشاف غير تزامنية (Discovery) تبحث في موقع أكوام عن العنوان المطلوب.\n\n' +
      '**خطوات المتابعة:**\n' +
      '1. استلام معرّف المهمة `id` (UUID).\n' +
      '2. الاستعلام عبر `GET /akwam/jobs/:id` أو الاشتراك في البث الحي `GET /akwam/jobs/:id/events`.\n' +
      '3. عندما تصبح الحالة `awaiting_selection`، يتم استدعاء `POST /akwam/jobs/:id/start` بمعرفات العناصر المطلوبة.',
  })
  @ApiCookieAuth('access_queue')
  @ApiCreatedResponse({
    description: 'تم إنشاء المهمة بنجاح وإدراجها في طابور BullMQ',
    type: JobSnapshotDto,
  })
  @ApiBadRequestResponse({
    description: 'خطأ في المدخلات (نص البحث مفقود أو فارغ أو تجاوز 100 حرف)',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'تجاوز حد الطلبات المسموح به لكل عنوان IP (Rate Limit Exceeded)',
    type: ErrorResponseDto,
  })
  @Post()
  @UseGuards(UserRateLimitGuard)
  @RateLimit({ scope: 'jobs' })
  async createJob(@Body() dto: CreateJobDto, @Req() req: Request) {
    return this.createJobUseCase.execute(dto.search, {
      bypass: !!req.queueBypass,
    });
  }

  @ApiOperation({
    summary: 'إحصائيات وحالة طابور المعالجة (Queue Metrics)',
    description: 'يسترجع الأعداد الحالية للمهام في طابور BullMQ (waiting, active, completed, failed, delayed).',
  })
  @ApiOkResponse({
    description: 'إحصائيات الطابور الشاملة',
  })
  @Get('queue/status')
  async getQueueMetrics() {
    return this.queueProvider.getQueueMetrics();
  }

  @ApiOperation({
    summary: 'استرجاع لقطة حالة المهمة (Get Job Snapshot)',
    description:
      'يسترجع الحالة الكاملة للمهمة من Redis متضمنة: حالة الطابور، مرحلة التقدم الحالية، قائمة النتائج المكتشفة، وروابط التحميل النهائية.',
  })
  @ApiParam({
    name: 'id',
    description: 'المعرف الفريد للمهمة (UUID v4)',
    example: '7c3ad391-0442-4118-ad7b-0d3dfe8851c5',
  })
  @ApiOkResponse({
    description: 'بيانات ولقطة حالة المهمة كاملة',
    type: JobSnapshotDto,
  })
  @ApiNotFoundResponse({
    description: 'المهمة غير موجودة في قاعدة بيانات Redis أو انتهت صلاحيتها (TTL)',
    type: ErrorResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'معرف المهمة الممرر ليس UUID صحيح',
    type: ErrorResponseDto,
  })
  @Get(':id')
  async getJob(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.getJobSnapshotUseCase.execute(id);
  }

  @ApiOperation({
    summary: 'الاشتراك في أحداث المهمة الحية (SSE Stream)',
    description:
      'يفتح تدفق أحداث من طرف الخادم (Server-Sent Events) يبث التحديثات فور وقوعها مع دعم Replay لآخر 10 أحداث.\n\n' +
      '**أنواع الأحداث المبثوثة:**\n' +
      '- `queue`: تحديث الترتيب والموقع في طابور الانتظار\n' +
      '- `status`: تغير حالة المهمة (`discovering`, `awaiting_selection`, `processing`, ...)\n' +
      '- `progress`: رسائل التقدم ونسبة الإنجاز\n' +
      '- `candidates`: قائمة الأعمال المكتشفة وجاهزية الاختيار\n' +
      '- `item`: اكتمال معالجة عمل معين\n' +
      '- `complete`: اكتمال كامل المهمة واستخراج كافة الروابط\n' +
      '- `cancelled`: إلغاء المهمة\n' +
      '- `error`: حدوث خطأ أثناء المعالجة\n\n' +
      'يُغلق التدفق تلقائياً بمجرد وصول المهمة إلى حالة نهائية (`completed`, `cancelled`, `failed`).',
  })
  @ApiParam({
    name: 'id',
    description: 'المعرف الفريد للمهمة (UUID v4)',
    example: '7c3ad391-0442-4118-ad7b-0d3dfe8851c5',
  })
  @ApiOkResponse({
    description: 'تدفق Server-Sent Events بصيغة text/event-stream',
    headers: {
      'Content-Type': {
        schema: { type: 'string', example: 'text/event-stream' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'المهمة غير موجودة',
    type: ErrorResponseDto,
  })
  @Sse(':id/events')
  streamJobEvents(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Observable<MessageEvent> {
    return this.jobRepository.subscribeEvents(id).pipe(
      map((event) => ({
        data: event,
      } as unknown as MessageEvent)),
    );
  }

  @ApiOperation({
    summary: 'بدء معالجة واستخراج روابط العناصر المختارة (Start Processing)',
    description:
      'ينقل المهمة من حالة انتظار الاختيار `awaiting_selection` إلى طابور المعالجة `queued` ➔ `processing` لجلب روابط التحميل المباشرة والجودات لكل عنصر تم اختياره.',
  })
  @ApiCookieAuth('access_queue')
  @ApiParam({
    name: 'id',
    description: 'معرف المهمة (UUID v4)',
    example: '7c3ad391-0442-4118-ad7b-0d3dfe8851c5',
  })
  @ApiCreatedResponse({
    description: 'تم قبول الاختيار وإدراج مهمة المعالجة في الطابور',
    type: JobSnapshotDto,
  })
  @ApiBadRequestResponse({
    description: 'مصفوفة المعرفات فارغة أو غير صحيحة أو المهمة ليست في حالة انتظار الاختيار',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'تجاوز حد الطلبات المسموح به',
    type: ErrorResponseDto,
  })
  @Post(':id/start')
  @UseGuards(UserRateLimitGuard)
  @RateLimit({ scope: 'jobs' })
  async startJob(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StartJobDto,
    @Req() req: Request,
  ) {
    return this.startProcessingUseCase.execute(id, dto.selectedIds, {
      bypass: !!req.queueBypass,
    });
  }

  @ApiOperation({
    summary: 'إلغاء المهمة وإيقاف المعالجة (Cancel Job)',
    description:
      'يقوم بإيقاف ومعالجة الطلبات الحالية وتحويل حالة المهمة إلى `cancelled` وإغلاق تدفق الـ SSE.',
  })
  @ApiParam({
    name: 'id',
    description: 'معرف المهمة (UUID v4)',
    example: '7c3ad391-0442-4118-ad7b-0d3dfe8851c5',
  })
  @ApiOkResponse({
    description: 'لقطة المهمة النهائية بعد الإلغاء (status: cancelled)',
    type: JobSnapshotDto,
  })
  @ApiNotFoundResponse({
    description: 'المهمة غير موجودة',
    type: ErrorResponseDto,
  })
  @Delete(':id')
  async cancelJob(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cancelJobUseCase.execute(id);
  }
}
