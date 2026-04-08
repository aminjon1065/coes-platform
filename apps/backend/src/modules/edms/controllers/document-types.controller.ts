import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EdmsService } from '../services/edms.service';

@ApiTags('EDMS / Document Types')
@ApiBearerAuth()
@Controller({ path: 'edms/document-types', version: '1' })
export class DocumentTypesController {
  constructor(private readonly edmsService: EdmsService) {}

  @Get()
  @ApiOperation({ summary: 'List active document types' })
  list() {
    return this.edmsService.listActiveDocumentTypes();
  }
}
