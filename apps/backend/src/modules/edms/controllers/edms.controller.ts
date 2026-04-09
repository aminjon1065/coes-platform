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
import { EdmsService } from '../services/edms.service';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { RegisterDocumentDto } from '../dto/register-document.dto';
import { TransitionStatusDto } from '../dto/transition-status.dto';
import { AddAttachmentDto } from '../dto/add-attachment.dto';
import { ListDocumentsDto } from '../dto/list-documents.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;          // credentialId
    clearance: number;    // user's clearanceLevel
    positionId?: string;  // active primary position (optional, from token claims)
  };
}

@Controller('edms/documents')
export class EdmsController {
  constructor(private readonly edmsService: EdmsService) {}

  // ─── List / Search ────────────────────────────────────────────────────────────

  @Get()
  list(@Query() query: ListDocumentsDto, @Req() req: AuthenticatedRequest) {
    return this.edmsService.listDocuments(
      query,
      req.user.sub,
      req.user.positionId ?? null,
      req.user.clearance ?? 0,
    );
  }

  // ─── Create ───────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDocumentDto, @Req() req: AuthenticatedRequest) {
    return this.edmsService.createDocument(dto, req.user.sub, req.user.positionId);
  }

  // ─── Get one ──────────────────────────────────────────────────────────────────

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.edmsService.getDocument(
      id,
      req.user.sub,
      req.user.positionId ?? null,
      req.user.clearance ?? 0,
    );
  }

  // ─── Update (DRAFT only) ──────────────────────────────────────────────────────

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.edmsService.updateDocument(id, dto, req.user.sub, req.user.clearance ?? 0);
  }

  // ─── Register ─────────────────────────────────────────────────────────────────

  @Post(':id/register')
  @HttpCode(HttpStatus.OK)
  register(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.edmsService.registerDocument(id, dto, req.user.sub, req.user.clearance ?? 0);
  }

  // ─── Status transition ────────────────────────────────────────────────────────

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.edmsService.transitionStatus(id, dto, req.user.sub, req.user.clearance ?? 0);
  }

  // ─── Versions ─────────────────────────────────────────────────────────────────

  @Get(':id/versions')
  getVersions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.edmsService.getVersions(id, req.user.sub, req.user.clearance ?? 0);
  }

  // ─── Attachments ──────────────────────────────────────────────────────────────

  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAttachmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.edmsService.addAttachment(id, dto, req.user.sub, req.user.clearance ?? 0);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.edmsService.removeAttachment(
      id,
      attachmentId,
      req.user.sub,
      req.user.clearance ?? 0,
    );
  }

  // ─── Archive Management ───────────────────────────────────────────────────────

  /**
   * List all archived documents accessible to the caller.
   * Optional: ?reviewBefore=YYYY-MM-DD to find documents due for retention review.
   */
  @Get('archive')
  listArchived(
    @Query('search') search: string | undefined,
    @Query('reviewBefore') reviewBefore: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.edmsService.listArchivedDocuments({
      search,
      reviewBefore: reviewBefore ? new Date(reviewBefore) : undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
      userClearance: req.user.clearance ?? 0,
    });
  }
}
