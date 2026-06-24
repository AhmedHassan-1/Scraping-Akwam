import {
  Controller,
  Post,
  Get,
  Delete,
  Query,
  Param,
  Body,
  BadRequestException,
  Sse,
  NotFoundException,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiCookieAuth,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UserRateLimitGuard } from '../queue/user-rate-limit.guard';
import { Observable } from 'rxjs';
import { AkwamService } from './akwam.service';
import { AkwamJobsService } from './akwam-jobs.service';

@Controller('akwam')
export class AkwamController {
  constructor(
    private readonly akwamService: AkwamService,
    private readonly jobsService: AkwamJobsService,
  ) {}

  // ── Utils ────────────────────────────────────────────────────────────────

  @ApiTags('utils')
  @ApiOperation({
    summary: 'Proxy a remote image',
    description:
      'Fetches an image from ak.sv and re-serves it, working around CORS/hotlink restrictions. ' +
      'The response is cached for 24 hours.',
  })
  @ApiQuery({
    name: 'url',
    required: true,
    description: 'Absolute URL of the image to proxy (must be an http/https URL from an allowed host)',
    example: 'https://ak.sv/uploads/poster/example.jpg',
  })
  @ApiResponse({ status: 200, description: 'Image binary (Content-Type preserved from origin)' })
  @ApiBadRequestResponse({ description: 'url param is missing or empty' })
  @ApiNotFoundResponse({ description: 'Image could not be fetched from origin' })
  @Get('proxy-image')
  async proxyImage(@Query('url') url: string, @Res() res: Response) {
    if (!url?.trim()) {
      throw new BadRequestException('رابط الصورة مطلوب');
    }
    try {
      const { buffer, contentType } =
        await this.akwamService.fetchProxiedImage(url);
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      });
      res.send(buffer);
    } catch {
      throw new NotFoundException('تعذر تحميل الصورة');
    }
  }

  // ── Legacy sync ──────────────────────────────────────────────────────────

  @ApiTags('legacy')
  @ApiCookieAuth('access_queue')
  @ApiOperation({
    summary: '[Legacy] Synchronous search',
    description:
      '**Deprecated** — prefer the async job flow.\n\n' +
      'Runs a full discover + process pipeline in a single blocking request. ' +
      'Returns only when ALL download links are resolved, which can take several minutes for TV series.',
    deprecated: true,
  })
  @ApiQuery({
    name: 'search',
    required: true,
    description: 'Arabic or English title to search for',
    example: 'كابتن أمريكا',
  })
  @ApiResponse({
    status: 201,
    description: 'Array of [["Movies", ...movieObjects], ["Series", ...seriesObjects]]',
  })
  @ApiBadRequestResponse({ description: 'search query is missing' })
  @ApiTooManyRequestsResponse({ description: 'Per-IP rate limit exceeded' })
  @Post()
  @UseGuards(UserRateLimitGuard)
  async search(@Query('search') search: string) {
    if (!search || search.trim() === '') {
      throw new BadRequestException(
        'يجب توفير كلمة البحث عبر query param: ?search=...',
      );
    }

    const results = await this.akwamService.getResults(search.trim());
    return results;
  }

  // ── Async job flow ────────────────────────────────────────────────────────

  @ApiTags('jobs')
  @ApiCookieAuth('access_queue')
  @ApiOperation({
    summary: 'Create a new search job',
    description:
      'Queues a discover phase that searches ak.sv for the given title. ' +
      'Poll `GET /akwam/jobs/:id` or subscribe to `GET /akwam/jobs/:id/events` (SSE) to track progress. ' +
      'Once status is `awaiting_selection`, call `POST /akwam/jobs/:id/start` with the IDs you want to process.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['search'],
      properties: {
        search: {
          type: 'string',
          description: 'Arabic or English title',
          example: 'Breaking Bad',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Job snapshot with id and initial queued status' })
  @ApiBadRequestResponse({ description: 'search field is missing or empty' })
  @ApiTooManyRequestsResponse({ description: 'Per-IP rate limit exceeded' })
  @Post('jobs')
  @UseGuards(UserRateLimitGuard)
  createJob(@Body('search') search: string, @Req() req: Request) {
    if (!search || search.trim() === '') {
      throw new BadRequestException('يجب توفير كلمة البحث');
    }
    return this.jobsService.createJob(search.trim(), {
      bypass: !!req.queueBypass,
    });
  }

  @ApiTags('jobs')
  @ApiOperation({
    summary: 'Get job snapshot',
    description: 'Returns the current state of a job: status, progress, discovered candidates, and final results.',
  })
  @ApiParam({ name: 'id', description: 'Job UUID returned by POST /akwam/jobs' })
  @ApiResponse({ status: 200, description: 'JobSnapshot object' })
  @ApiNotFoundResponse({ description: 'Job not found' })
  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    try {
      return await this.jobsService.getSnapshot(id);
    } catch {
      throw new NotFoundException('المهمة غير موجودة');
    }
  }

  @ApiTags('jobs')
  @ApiOperation({
    summary: 'Subscribe to job events (SSE)',
    description:
      'Opens a Server-Sent Events stream that emits typed events as the job progresses.\n\n' +
      '**Event types:** `status` | `progress` | `candidates` | `item` | `complete` | `error` | `cancelled` | `queue`\n\n' +
      'The stream closes automatically when the job reaches `completed`, `cancelled`, or `failed`.',
  })
  @ApiParam({ name: 'id', description: 'Job UUID' })
  @ApiResponse({
    status: 200,
    description: 'text/event-stream — each event is `data: <JSON>\\n\\n`',
  })
  @ApiNotFoundResponse({ description: 'Job not found' })
  @Sse('jobs/:id/events')
  jobEvents(@Param('id') id: string): Observable<MessageEvent> {
    try {
      return this.jobsService.getEventStream(id);
    } catch {
      throw new NotFoundException('المهمة غير موجودة');
    }
  }

  @ApiTags('jobs')
  @ApiCookieAuth('access_queue')
  @ApiOperation({
    summary: 'Start processing selected candidates',
    description:
      'Moves the job from `awaiting_selection` → `queued` → `processing`. ' +
      'Pass the `id` values from the `candidates` array returned in the `candidates` event or job snapshot. ' +
      'The job will scrape each selected item and resolve its download links.',
  })
  @ApiParam({ name: 'id', description: 'Job UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['selectedIds'],
      properties: {
        selectedIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Candidate IDs to process (from the candidates list)',
          example: [0, 2],
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Updated job snapshot (status: queued)' })
  @ApiBadRequestResponse({ description: 'selectedIds is empty, invalid, or job is not awaiting_selection' })
  @ApiTooManyRequestsResponse({ description: 'Per-IP rate limit exceeded' })
  @Post('jobs/:id/start')
  @UseGuards(UserRateLimitGuard)
  async startJob(
    @Param('id') id: string,
    @Body('selectedIds') selectedIds: number[],
    @Req() req: Request,
  ) {
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      throw new BadRequestException('يجب اختيار عنصر واحد على الأقل');
    }
    try {
      return await this.jobsService.startProcessing(id, selectedIds, {
        bypass: !!req.queueBypass,
      });
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  @ApiTags('jobs')
  @ApiOperation({
    summary: 'Cancel a job',
    description:
      'Aborts in-flight HTTP requests and transitions the job to `cancelled`. ' +
      'Has no effect if the job is already in a terminal state (completed / cancelled / failed).',
  })
  @ApiParam({ name: 'id', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Final job snapshot (status: cancelled)' })
  @ApiNotFoundResponse({ description: 'Job not found' })
  @Delete('jobs/:id')
  cancelJob(@Param('id') id: string) {
    try {
      return this.jobsService.cancelJob(id);
    } catch {
      throw new NotFoundException('المهمة غير موجودة');
    }
  }
}
