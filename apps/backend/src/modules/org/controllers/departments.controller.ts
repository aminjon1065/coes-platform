import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrgService } from '../services/org.service';
import { CreateDepartmentDto } from '../dto/create-department.dto';
import { CurrentUser, AuthenticatedUser } from '../../iam/decorators/current-user.decorator';

@ApiTags('Organizations / Departments')
@ApiBearerAuth()
@Controller({ path: 'org/departments', version: '1' })
export class DepartmentsController {
  constructor(private readonly orgService: OrgService) {}

  @Get('tree')
  @ApiOperation({ summary: 'Get full department hierarchy as a tree' })
  getTree() {
    return this.orgService.getDepartmentTree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get department by ID' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.getDepartmentById(id);
  }

  @Get(':id/descendants')
  @ApiOperation({ summary: 'Get all descendant departments' })
  getDescendants(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.getDescendants(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a department' })
  create(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.createDepartment(dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a department' })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.deactivateDepartment(id, user.id);
  }
}
