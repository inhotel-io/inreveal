import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  FaceRepairApplyRequestDto,
  FaceRepairApplyResponseDto,
  FaceRepairDeclineCreatedDto,
  FaceRepairDeclineListDto,
  FaceRepairDeclineRemoveRequestDto,
  FaceRepairDeclineRemovedDto,
  FaceRepairDeclineRequestDto,
  FaceRepairPersonFacesDto,
  FaceRepairRequestDto,
  FaceRepairResponseDto,
  FaceRepairScanStatusDto,
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
  triggerScan(@Auth() auth: AuthDto): Promise<FaceRepairScanTriggerResponseDto> {
    return this.service.triggerScan(auth.user.id) as Promise<FaceRepairScanTriggerResponseDto>;
  }

  @Get('scan/latest')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Get the latest face-repair scan', history: new HistoryBuilder().added('v1') })
  getLatestScan(): Promise<FaceRepairScanStatusDto | null> {
    return this.service.getLatestScanStatus() as Promise<FaceRepairScanStatusDto | null>;
  }

  @Get('scan/person/:personId')
  @Authenticated({ admin: true })
  @Endpoint({ summary: "Get a person's flagged faces for review", history: new HistoryBuilder().added('v1') })
  getFaceRepairPersonFaces(
    @Param('personId', new ParseUUIDPipe({ version: '4' })) personId: string,
  ): Promise<FaceRepairPersonFacesDto> {
    return this.service.getPersonFlaggedFaces(personId) as Promise<FaceRepairPersonFacesDto>;
  }

  @Post('apply')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Apply face re-attribution for approved persons', history: new HistoryBuilder().added('v1') })
  applyFaceRepair(@Body() dto: FaceRepairApplyRequestDto): Promise<FaceRepairApplyResponseDto> {
    return this.service.applyRepair(dto) as Promise<FaceRepairApplyResponseDto>;
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
    return this.service.removeDeclines(dto.ids) as Promise<FaceRepairDeclineRemovedDto>;
  }
}
