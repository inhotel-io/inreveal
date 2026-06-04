import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  FaceRepairApplyRequestDto,
  FaceRepairApplyResponseDto,
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

  @Post('apply')
  @Authenticated({ admin: true })
  @Endpoint({ summary: 'Apply face re-attribution for approved persons', history: new HistoryBuilder().added('v1') })
  applyFaceRepair(@Body() dto: FaceRepairApplyRequestDto): Promise<FaceRepairApplyResponseDto> {
    return this.service.applyRepair(dto) as Promise<FaceRepairApplyResponseDto>;
  }
}
