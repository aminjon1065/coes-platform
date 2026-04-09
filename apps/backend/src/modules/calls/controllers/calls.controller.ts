import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';

import { CallsService } from '../services/calls.service';
import { InitiateCallDto, ScheduleCallDto } from '../dto/initiate-call.dto';
import { ModerateParticipantDto } from '../dto/moderate-participant.dto';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    clearance: number;
    positionId?: string;
  };
}

@ApiTags('Calls')
@ApiBearerAuth()
@Controller({ path: 'calls', version: '1' })
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Initiate a new call session' })
  initiateCall(@Body() dto: InitiateCallDto, @Req() req: AuthenticatedRequest) {
    return this.callsService.initiateCall(
      dto,
      req.user.sub,
      req.user.positionId,
      req.user.clearance ?? 0,
    );
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get call session details' })
  getSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.getSession(id, req.user.sub, req.user.clearance ?? 0);
  }

  @Post('sessions/:id/join')
  @ApiOperation({ summary: 'Join an active call session' })
  joinCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.joinCall(id, req.user.sub, req.user.positionId, req.user.clearance ?? 0);
  }

  @Post('sessions/:id/leave')
  @ApiOperation({ summary: 'Leave a call session' })
  leaveCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.leaveCall(id, req.user.sub);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'End a call session (moderator)' })
  endCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.endCall(id, req.user.sub);
  }

  @Delete('sessions/:id/participants/:participantId')
  @ApiOperation({ summary: 'Remove participant from a call session (moderator)' })
  removeParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.removeParticipant(id, participantId, req.user.sub);
  }

  @Post('sessions/:id/participants/:participantId/mute')
  @ApiOperation({ summary: 'Update participant mute state (moderator)' })
  moderateParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: ModerateParticipantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.moderateParticipant(id, participantId, req.user.sub, dto);
  }

  @Post('sessions/:id/recordings')
  @ApiOperation({ summary: 'Start recording a call session' })
  startRecording(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.startRecording(id, req.user.sub, req.user.clearance ?? 0);
  }

  @Delete('recordings/:recordingId')
  @ApiOperation({ summary: 'Stop an active recording' })
  stopRecording(
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.stopRecording(recordingId, req.user.sub);
  }

  @Get('recordings/:recordingId/download-url')
  @ApiOperation({ summary: 'Get a pre-signed download URL for a finalized recording' })
  getRecordingDownloadUrl(
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
    @Query('expirySeconds') expirySeconds: number | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.callsService.getRecordingDownloadUrl(
      recordingId,
      req.user.sub,
      req.user.clearance ?? 0,
      expirySeconds ?? 3600,
    );
  }

  @Post('schedules')
  @ApiOperation({ summary: 'Schedule a meeting' })
  scheduleMeeting(@Body() dto: ScheduleCallDto, @Req() req: AuthenticatedRequest) {
    return this.callsService.scheduleMeeting(dto, req.user.sub, req.user.clearance ?? 0);
  }

  @Get('schedules')
  @ApiOperation({ summary: 'List upcoming scheduled meetings' })
  listUpcoming(
    @Req() req: AuthenticatedRequest,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.callsService.listUpcoming(req.user.clearance ?? 0, limit, offset);
  }
}
