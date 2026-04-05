import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';

import { FilesService } from '../services/files.service';
import { UploadFileDto } from '../dto/upload-file.dto';
import { ListFilesDto } from '../dto/list-files.dto';
import { CreateFolderDto } from '../dto/create-folder.dto';
import { PermissionAction, PermissionEffect } from '../entities/file-permission.entity';
import { LinkedEntityType } from '../entities/file-link.entity';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    clearance: number;
    positionId?: string;
  };
}

@ApiTags('Files')
@ApiBearerAuth()
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ─── Files ────────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List files accessible to the caller' })
  async listFiles(
    @Query() query: ListFilesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const [files, total] = await this.filesService.listFiles(
      query,
      req.user.positionId ?? req.user.sub,
      req.user.clearance ?? 0,
    );
    return { data: files, total };
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new file (multipart/form-data)' })
  async upload(
    @Query() query: UploadFileDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const part = await (req as any).file();
    if (!part) throw new Error('No file part found in multipart request');

    return this.filesService.uploadFile(
      part.file,
      {
        displayName: query.displayName ?? part.filename ?? 'unnamed',
        originalFilename: part.filename ?? 'unnamed',
        mimeType: part.mimetype ?? 'application/octet-stream',
        folderId: query.folderId ?? null,
        classification: query.classification ?? 1,
        uploadNote: query.uploadNote ?? null,
      },
      req.user.sub,
      req.user.positionId ?? req.user.sub,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file metadata' })
  getFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.getFile(id, req.user.positionId ?? req.user.sub, req.user.clearance ?? 0);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a file' })
  deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.deleteFile(
      id,
      req.user.sub,
      req.user.positionId ?? req.user.sub,
      req.user.clearance ?? 0,
    );
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions of a file' })
  getVersions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.getVersions(id, req.user.positionId ?? req.user.sub, req.user.clearance ?? 0);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new version of an existing file' })
  async uploadNewVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('uploadNote') uploadNote: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const part = await (req as any).file();
    if (!part) throw new Error('No file part found in multipart request');

    return this.filesService.uploadNewVersion(
      id,
      part.file,
      uploadNote ?? null,
      req.user.sub,
      req.user.positionId ?? req.user.sub,
      req.user.clearance ?? 0,
    );
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Get a pre-signed download URL (expires in 1 hour by default)' })
  getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expirySeconds') expirySeconds: number | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.getPresignedDownloadUrl(
      id,
      req.user.sub,
      req.user.positionId ?? req.user.sub,
      req.user.clearance ?? 0,
      expirySeconds ?? 3600,
    );
  }

  // ─── Folders ──────────────────────────────────────────────────────────────────

  @Get('folders/tree')
  @ApiOperation({ summary: 'List root folder contents (or a specific folder)' })
  listFolderContents(
    @Query('folderId') folderId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.listFolderContents(folderId ?? null, req.user.clearance ?? 0);
  }

  @Post('folders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new folder' })
  createFolder(
    @Body() dto: CreateFolderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.createFolder(
      dto,
      req.user.sub,
      req.user.positionId ?? req.user.sub,
      req.user.clearance ?? 0,
    );
  }

  @Delete('folders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an empty folder' })
  deleteFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.deleteFolder(id, req.user.sub);
  }

  // ─── Permissions ──────────────────────────────────────────────────────────────

  @Get(':id/permissions')
  @ApiOperation({ summary: 'List permissions on a file' })
  listPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.listPermissions(
      id,
      req.user.positionId ?? req.user.sub,
      req.user.clearance ?? 0,
    );
  }

  @Post(':id/permissions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Grant or update a permission on a file' })
  grantPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      granteePositionId: string;
      action: PermissionAction;
      effect?: PermissionEffect;
      expiresAt?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.grantPermission(
      id,
      body.granteePositionId,
      body.action,
      body.effect ?? PermissionEffect.ALLOW,
      req.user.sub,
      req.user.positionId ?? req.user.sub,
      req.user.clearance ?? 0,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
  }

  @Delete(':id/permissions/:permId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a permission' })
  revokePermission(
    @Param('id', ParseUUIDPipe) _fileId: string,
    @Param('permId', ParseUUIDPipe) permId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.revokePermission(permId, req.user.sub);
  }

  // ─── Links ────────────────────────────────────────────────────────────────────

  @Get('links/:entityType/:entityId')
  @ApiOperation({ summary: 'Get all files linked to an entity (task, document, message, channel)' })
  getLinksForEntity(
    @Param('entityType', new ParseEnumPipe(LinkedEntityType)) entityType: LinkedEntityType,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.getLinksForEntity(entityId, entityType, req.user.clearance ?? 0);
  }

  @Post(':id/links')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Link a file to an entity' })
  linkFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { linkedEntityId: string; linkedEntityType: LinkedEntityType },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.linkFile(
      id,
      body.linkedEntityId,
      body.linkedEntityType,
      req.user.sub,
      req.user.positionId ?? req.user.sub,
      req.user.clearance ?? 0,
    );
  }

  @Delete(':id/links/:entityType/:entityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink a file from an entity' })
  unlinkFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entityType', new ParseEnumPipe(LinkedEntityType)) entityType: LinkedEntityType,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.unlinkFile(id, entityId, entityType, req.user.sub);
  }
}
