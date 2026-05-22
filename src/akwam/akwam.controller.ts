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
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { AkwamService } from './akwam.service';
import { AkwamJobsService } from './akwam-jobs.service';

@Controller('akwam')
export class AkwamController {
  constructor(
    private readonly akwamService: AkwamService,
    private readonly jobsService: AkwamJobsService,
  ) {}

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

  /** Legacy synchronous search */
  @Post()
  async search(@Query('search') search: string) {
    if (!search || search.trim() === '') {
      throw new BadRequestException(
        'يجب توفير كلمة البحث عبر query param: ?search=...',
      );
    }

    const results = await this.akwamService.getResults(search.trim());
    return results;
  }

  /** Start async search job (discover → select → process) */
  @Post('jobs')
  createJob(@Body('search') search: string) {
    if (!search || search.trim() === '') {
      throw new BadRequestException('يجب توفير كلمة البحث');
    }
    return this.jobsService.createJob(search.trim());
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    try {
      return this.jobsService.getSnapshot(id);
    } catch {
      throw new NotFoundException('المهمة غير موجودة');
    }
  }

  @Sse('jobs/:id/events')
  jobEvents(@Param('id') id: string): Observable<MessageEvent> {
    try {
      return this.jobsService.getEventStream(id);
    } catch {
      throw new NotFoundException('المهمة غير موجودة');
    }
  }

  @Post('jobs/:id/start')
  async startJob(
    @Param('id') id: string,
    @Body('selectedIds') selectedIds: number[],
  ) {
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      throw new BadRequestException('يجب اختيار عنصر واحد على الأقل');
    }
    try {
      return await this.jobsService.startProcessing(id, selectedIds);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  @Delete('jobs/:id')
  cancelJob(@Param('id') id: string) {
    try {
      return this.jobsService.cancelJob(id);
    } catch {
      throw new NotFoundException('المهمة غير موجودة');
    }
  }
}
