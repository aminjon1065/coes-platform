import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { TasksService } from '../services/tasks.service';
import { CreateTaskDto } from '../dto/create-task.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { ListTasksDto } from '../dto/list-tasks.dto';
import { TransitionTaskStatusDto } from '../dto/transition-task-status.dto';
import { AddExecutorDto } from '../dto/add-executor.dto';
import { AddCommentDto } from '../dto/add-comment.dto';
import { AddAttachmentDto } from '../dto/add-attachment.dto';
import { UpdateProgressDto } from '../dto/update-progress.dto';
import { ReassignTaskDto } from '../dto/reassign-task.dto';
import { RequestDeadlineExtensionDto } from '../dto/request-deadline-extension.dto';
import { ReviewDeadlineExtensionDto } from '../dto/review-deadline-extension.dto';
import { CreateTaskTypeDto } from '../dto/create-task-type.dto';
import { UpdateTaskTypeDto } from '../dto/update-task-type.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    clearance: number;
    positionId?: string;
  };
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // ─── Task Types (§17.1) ───────────────────────────────────────────────────────

  @Get('types')
  listTypes() {
    return this.tasksService.listTaskTypes();
  }

  @Post('types')
  @HttpCode(HttpStatus.CREATED)
  createType(@Body() dto: CreateTaskTypeDto) {
    return this.tasksService.createTaskType(dto);
  }

  @Patch('types/:id')
  updateType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskTypeDto,
  ) {
    return this.tasksService.updateTaskType(id, dto);
  }

  // ─── Supervisor Oversight (2.3.1) ─────────────────────────────────────────────

  /**
   * Returns all tasks assigned to positions subordinate to the requesting supervisor.
   * Used for oversight dashboards: pending reviews, overdue escalations, completion tracking.
   */
  @Get('oversight')
  supervisorOversight(
    @Query('positionId') positionId: string,
    @Query('status') status: string,
    @Query('isOverdue') isOverdue: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.listTasksForSupervisor(
      positionId ?? req.user.positionId!,
      req.user.clearance ?? 0,
      {
        status: status as any,
        isOverdue: isOverdue !== undefined ? isOverdue === 'true' : undefined,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    );
  }

  // ─── Tasks CRUD ───────────────────────────────────────────────────────────────

  @Get()
  list(@Query() query: ListTasksDto, @Req() req: AuthenticatedRequest) {
    return this.tasksService.listTasks(query, req.user.sub, req.user.clearance ?? 0);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTaskDto, @Req() req: AuthenticatedRequest) {
    return this.tasksService.createTask(dto, req.user.sub, req.user.positionId!);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.tasksService.getTask(id, req.user.clearance ?? 0);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.updateTask(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── State machine ────────────────────────────────────────────────────────────

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionTaskStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.transitionStatus(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── Reassignment (§6.5) ─────────────────────────────────────────────────────

  @Post(':id/reassign')
  @HttpCode(HttpStatus.OK)
  reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReassignTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.reassignTask(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── Progress ─────────────────────────────────────────────────────────────────

  @Patch(':id/progress')
  @HttpCode(HttpStatus.OK)
  updateProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgressDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.updateProgress(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── Executors ────────────────────────────────────────────────────────────────

  @Post(':id/executors')
  @HttpCode(HttpStatus.CREATED)
  addExecutor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddExecutorDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.addExecutor(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  @Delete(':id/executors/:assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeExecutor(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.removeExecutor(
      id,
      assignmentId,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── Comments ─────────────────────────────────────────────────────────────────

  @Get(':id/comments')
  getComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeInternal') includeInternal: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.getComments(
      id,
      req.user.positionId!,
      req.user.clearance ?? 0,
      includeInternal === 'true',
    );
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCommentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.addComment(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── Attachments ──────────────────────────────────────────────────────────────

  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAttachmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.addAttachment(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.removeAttachment(
      id,
      attachmentId,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── Deadline Extension Requests (§4.10) ──────────────────────────────────────

  @Get(':id/deadline-extensions')
  listExtensions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.listDeadlineExtensions(id, req.user.clearance ?? 0);
  }

  @Post(':id/deadline-extensions')
  @HttpCode(HttpStatus.CREATED)
  requestExtension(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestDeadlineExtensionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.requestDeadlineExtension(
      id,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  @Patch(':id/deadline-extensions/:requestId')
  @HttpCode(HttpStatus.OK)
  reviewExtension(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ReviewDeadlineExtensionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.reviewDeadlineExtension(
      id,
      requestId,
      dto,
      req.user.sub,
      req.user.positionId!,
      req.user.clearance ?? 0,
    );
  }

  // ─── History ──────────────────────────────────────────────────────────────────

  @Get(':id/history')
  getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tasksService.getTaskHistory(id, req.user.clearance ?? 0);
  }
}
