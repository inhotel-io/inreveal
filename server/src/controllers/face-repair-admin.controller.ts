import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  FaceRepairApplyRequestDto,
  FaceRepairApplyResponseDto,
  FaceRepairClusterFacesRequestDto,
  FaceRepairClusterFacesResponseDto,
  FaceRepairDeclineCreatedDto,
  FaceRepairDeclineListDto,
  FaceRepairDeclineRemoveRequestDto,
  FaceRepairDeclineRemovedDto,
  FaceRepairDeclineRequestDto,
  FaceRepairPersonFacesDto,
  FaceRepairRequestDto,
  FaceRepairResolveRequestDto,
  FaceRepairResolveResponseDto,
  FaceRepairResponseDto,
  FaceRepairScanDefaultsDto,
  FaceRepairScanStatusDto,
  FaceRepairScanTriggerRequestDto,
  FaceRepairScanTriggerResponseDto,
} from 'src/dtos/face-repair.dto';
import { ApiTag } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { FaceRepairService } from 'src/services/face-repair.service';

@ApiTags(ApiTag.Faces)
@Controller('admin/face-repair')
export class FaceRepairAdminController {
  constructor(private service: FaceRepairService) {}

  @Post()
  @Authenticated({ admin: true })
  @Endpoint({
    summary: 'Run face re-attribution repair',
    history: new HistoryBuilder().added('v1'),
  })
  runFaceRepair(@Body() dto: FaceRepairRequestDto): Promise<FaceRepairResponseDto> {
    return this.service.runRepair(dto) as Promise<FaceRepairResponseDto>;
  }

  @Post('scan')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Trigger a face-repair scan', history: new HistoryBuilder().added('v1') })
  triggerScan(
    @Auth() auth: AuthDto,
    @Body() dto: FaceRepairScanTriggerRequestDto,
  ): Promise<FaceRepairScanTriggerResponseDto> {
    return this.service.triggerScan(auth.user.id, dto.params) as Promise<FaceRepairScanTriggerResponseDto>;
  }

  @Get('scan/latest')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Get the latest face-repair scan', history: new HistoryBuilder().added('v1') })
  getLatestScan(): Promise<FaceRepairScanStatusDto | null> {
    return this.service.getLatestScanStatus() as Promise<FaceRepairScanStatusDto | null>;
  }

  @Get('scan/defaults')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Get effective face-repair scan defaults', history: new HistoryBuilder().added('v1') })
  getFaceRepairScanDefaults(): Promise<FaceRepairScanDefaultsDto> {
    return this.service.getScanDefaults() as Promise<FaceRepairScanDefaultsDto>;
  }

  @Get('scan/person/:personId')
  @Authenticated({ admin: true })
  @Endpoint({ summary: "Get a person's flagged faces for review", history: new HistoryBuilder().added('v1') })
  getFaceRepairPersonFaces(
    @Param('personId', new ParseUUIDPipe({ version: '4' })) personId: string,
  ): Promise<FaceRepairPersonFacesDto> {
    return this.service.getPersonFlaggedFaces(personId) as Promise<FaceRepairPersonFacesDto>;
  }

  @Post('scan/person/:personId/cluster-faces')
  @Authenticated({ admin: true })
  @Endpoint({
    summary: "List a person's cluster faces (paginated, excluding the supplied flagged ids)",
    history: new HistoryBuilder().added('v1'),
  })
  getFaceRepairClusterFaces(
    @Param('personId', new ParseUUIDPipe({ version: '4' })) personId: string,
    @Body() dto: FaceRepairClusterFacesRequestDto,
  ): Promise<FaceRepairClusterFacesResponseDto> {
    return this.service.getClusterFaces(personId, dto) as Promise<FaceRepairClusterFacesResponseDto>;
  }

  @Post('apply')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Apply face re-attribution for approved persons', history: new HistoryBuilder().added('v1') })
  applyFaceRepair(@Body() dto: FaceRepairApplyRequestDto): Promise<FaceRepairApplyResponseDto> {
    return this.service.applyRepair(dto) as Promise<FaceRepairApplyResponseDto>;
  }

  @Post('resolve')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Resolve reviewed faces', history: new HistoryBuilder().added('v1') })
  resolveFaces(@Auth() auth: AuthDto, @Body() dto: FaceRepairResolveRequestDto): Promise<FaceRepairResolveResponseDto> {
    return this.service.resolveFaces(dto, auth.user.id) as Promise<FaceRepairResolveResponseDto>;
  }

  @Post('decline')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Decline flagged faces / dismiss flagged persons', history: new HistoryBuilder().added('v1') })
  declineFaceRepair(
    @Auth() auth: AuthDto,
    @Body() dto: FaceRepairDeclineRequestDto,
  ): Promise<FaceRepairDeclineCreatedDto> {
    return this.service.createDeclines({ ...dto, declinedBy: auth.user.id }) as Promise<FaceRepairDeclineCreatedDto>;
  }

  @Get('decline')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'List face-repair declines', history: new HistoryBuilder().added('v1') })
  getFaceRepairDeclines(): Promise<FaceRepairDeclineListDto> {
    return this.service.listDeclines() as unknown as Promise<FaceRepairDeclineListDto>;
  }

  @Delete('decline')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Remove face-repair declines', history: new HistoryBuilder().added('v1') })
  removeFaceRepairDeclines(@Body() dto: FaceRepairDeclineRemoveRequestDto): Promise<FaceRepairDeclineRemovedDto> {
    return this.service.removeDeclines(dto) as Promise<FaceRepairDeclineRemovedDto>;
  }
}
