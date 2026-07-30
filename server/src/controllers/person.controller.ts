import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Next,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { NextFunction, Response } from 'express';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { BulkIdResponseDto, BulkIdsDto } from 'src/dtos/asset-ids.response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  AssetFaceUpdateDto,
  DetachScopedPersonDto,
  FaceSuggestionActionResponseDto,
  MergePersonDto,
  MergeScopedPeopleDto,
  PeopleFaceStatisticsResponseDto,
  PeopleResponseDto,
  PeopleStatisticsResponseDto,
  PeopleUpdateDto,
  PersonCreateDto,
  PersonFacePageQueryDto,
  PersonFacePageResponseDto,
  PersonFaceSuggestionPageQueryDto,
  PersonFaceSuggestionPageResponseDto,
  PersonFaceSuggestionParamsDto,
  PersonResponseDto,
  PersonSearchDto,
  PersonStatisticsResponseDto,
  PersonUpdateDto,
  RepresentativeFaceUpdateDto,
} from 'src/dtos/person.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated, FileResponse } from 'src/middleware/auth.guard';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonService } from 'src/services/person.service';
import { sendFile } from 'src/utils/file';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.People)
@Controller('people')
export class PersonController {
  constructor(
    private service: PersonService,
    private logger: LoggingRepository,
  ) {
    this.logger.setContext(PersonController.name);
  }

  @Get()
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: 'Get all people',
    description: 'Retrieve a list of all people.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getAllPeople(@Auth() auth: AuthDto, @Query() options: PersonSearchDto): Promise<PeopleResponseDto> {
    return this.service.getAll(auth, options);
  }

  @Post()
  @Authenticated({ permission: Permission.PersonCreate })
  @Endpoint({
    summary: 'Create a person',
    description: 'Create a new person that can have multiple faces assigned to them.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  createPerson(@Auth() auth: AuthDto, @Body() dto: PersonCreateDto): Promise<PersonResponseDto> {
    return this.service.create(auth, dto);
  }

  @Put()
  @Authenticated({ permission: Permission.PersonUpdate })
  @Endpoint({
    summary: 'Update people',
    description: 'Bulk update multiple people at once.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  updatePeople(@Auth() auth: AuthDto, @Body() dto: PeopleUpdateDto): Promise<BulkIdResponseDto[]> {
    return this.service.updateAll(auth, dto);
  }

  @Delete()
  @Authenticated({ permission: Permission.PersonDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Delete people',
    description: 'Bulk delete a list of people at once.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  deletePeople(@Auth() auth: AuthDto, @Body() dto: BulkIdsDto): Promise<void> {
    return this.service.deleteAll(auth, dto);
  }

  @Post('same-person')
  @Authenticated({ permission: Permission.PersonMerge })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Merge scoped people by identity',
    description: 'Mark personal and space people as the same person without exposing raw face identity IDs.',
    history: new HistoryBuilder().added('v2').stable('v2'),
  })
  mergeScopedPeople(@Auth() auth: AuthDto, @Body() dto: MergeScopedPeopleDto): Promise<void> {
    return this.service.mergeScopedPeople(auth, dto);
  }

  @Post('detach-profile')
  @Authenticated({ permission: Permission.PersonMerge })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Detach a scoped person profile',
    description: 'Separate one personal or space person profile from a grouped person identity.',
    history: new HistoryBuilder().added('v2').stable('v2'),
  })
  detachScopedPerson(@Auth() auth: AuthDto, @Body() dto: DetachScopedPersonDto): Promise<void> {
    return this.service.detachScopedPerson(auth, dto);
  }

  @Get('statistics')
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: 'Get people statistics',
    description: 'Retrieve people and detected-face counts for the authenticated user people scope.',
    history: new HistoryBuilder().added('v2').stable('v2'),
  })
  getPeopleStatistics(@Auth() auth: AuthDto, @Query() options: PersonSearchDto): Promise<PeopleStatisticsResponseDto> {
    return this.service.getPeopleStatistics(auth, options);
  }

  @Get('face-statistics')
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: 'Get people face statistics',
    description: 'Retrieve detailed detected-face counts for the authenticated user people scope.',
    history: new HistoryBuilder().added('v2').stable('v2'),
  })
  getPeopleFaceStatistics(
    @Auth() auth: AuthDto,
    @Query() options: PersonSearchDto,
  ): Promise<PeopleFaceStatisticsResponseDto> {
    return this.service.getPeopleFaceStatistics(auth, options);
  }

  @Get(':id/faces')
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: 'Get person faces',
    description: 'Retrieve detected face crops for a person.',
    history: new HistoryBuilder().added('v2').stable('v2'),
  })
  getPersonFaces(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Query() dto: PersonFacePageQueryDto,
  ): Promise<PersonFacePageResponseDto> {
    return this.service.getFacesForPicker(auth, id, dto);
  }

  @Get(':id/faces/:faceId/thumbnail')
  @FileResponse()
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: 'Get person face thumbnail',
    description: 'Retrieve an exact face-crop thumbnail for a person.',
    history: new HistoryBuilder().added('v2').stable('v2'),
  })
  async getPersonFaceThumbnail(
    @Res() res: Response,
    @Next() next: NextFunction,
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Param('faceId') faceId: string,
  ) {
    await sendFile(res, next, () => this.service.getFaceThumbnail(auth, id, faceId), this.logger);
  }

  @Put(':id/representative-face')
  @Authenticated({ permission: Permission.PersonUpdate })
  @Endpoint({
    summary: 'Update representative face',
    description: 'Update the exact face crop used as the person thumbnail.',
    history: new HistoryBuilder().added('v2').stable('v2'),
  })
  updateRepresentativeFace(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: RepresentativeFaceUpdateDto,
  ): Promise<PersonResponseDto> {
    return this.service.updateRepresentativeFace(auth, id, dto);
  }

  @Get(':id')
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: 'Get a person',
    description: 'Retrieve a person by id.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getPerson(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<PersonResponseDto> {
    return this.service.getById(auth, id);
  }

  @Put(':id')
  @Authenticated({ permission: Permission.PersonUpdate })
  @Endpoint({
    summary: 'Update person',
    description: 'Update an individual person.',
    history: new HistoryBuilder()
      .added('v1')
      .beta('v1')
      .stable('v2')
      .deprecated('v3', { replacementId: 'updatePerson' }),
  })
  updatePerson(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: PersonUpdateDto,
  ): Promise<PersonResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Patch(':id')
  @ApiExcludeEndpoint()
  @Authenticated({ permission: Permission.PersonUpdate })
  updatePersonV3(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: PersonUpdateDto,
  ): Promise<PersonResponseDto> {
    return this.service.update(auth, id, dto);
  }

  @Delete(':id')
  @Authenticated({ permission: Permission.PersonDelete })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Delete person',
    description: 'Delete an individual person.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  deletePerson(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<void> {
    return this.service.delete(auth, id);
  }

  @Get(':id/statistics')
  @Authenticated({ permission: Permission.PersonStatistics })
  @Endpoint({
    summary: 'Get person statistics',
    description: 'Retrieve statistics about a specific person.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  getPersonStatistics(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto): Promise<PersonStatisticsResponseDto> {
    return this.service.getStatistics(auth, id);
  }

  @Get(':id/thumbnail')
  @FileResponse()
  @Authenticated({ permission: Permission.PersonRead })
  @Endpoint({
    summary: 'Get person thumbnail',
    description: 'Retrieve the thumbnail file for a person.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  async getPersonThumbnail(
    @Res() res: Response,
    @Next() next: NextFunction,
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
  ) {
    await sendFile(res, next, () => this.service.getThumbnail(auth, id), this.logger);
  }

  @Put(':id/reassign')
  @Authenticated({ permission: Permission.PersonReassign })
  @Endpoint({
    summary: 'Reassign faces',
    description: 'Bulk reassign a list of faces to a different person.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  reassignFaces(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: AssetFaceUpdateDto,
  ): Promise<PersonResponseDto[]> {
    return this.service.reassignFaces(auth, id, dto);
  }

  @Post(':id/merge')
  @Authenticated({ permission: Permission.PersonMerge })
  @HttpCode(HttpStatus.OK)
  @Endpoint({
    summary: 'Merge people',
    description: 'Merge a list of people into the person specified in the path parameter.',
    history: new HistoryBuilder().added('v1').beta('v1').stable('v2'),
  })
  mergePerson(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: MergePersonDto,
  ): Promise<BulkIdResponseDto[]> {
    return this.service.mergePerson(auth, id, dto);
  }

  // F21: publishes the permission getFaceSuggestions actually enforces. Deliberately PersonUpdate, not
  // PersonRead — PersonRead also resolves via access.person.checkSharedSpaceAccess (see
  // src/utils/access.ts), which would let a space member read the owner's whole-library pending review
  // queue (D6, see the comment on getFaceSuggestions in person.service.ts). Do not relax this back to
  // PersonRead to "match" a shared-space caller; the service enforcement is the source of truth here.
  @Get(':id/face-suggestions')
  @Authenticated({ permission: Permission.PersonUpdate })
  @Endpoint({
    summary: 'Get face suggestions for a person',
    description: 'Retrieve near-miss unassigned faces suggested for this person, best match first.',
    history: new HistoryBuilder().added('v1').beta('v1'),
  })
  getPersonFaceSuggestions(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Query() dto: PersonFaceSuggestionPageQueryDto,
  ): Promise<PersonFaceSuggestionPageResponseDto> {
    return this.service.getFaceSuggestions(auth, id, dto);
  }

  // F21: publishes PersonUpdate, the person-level permission confirmFaceSuggestion enforces — not
  // PersonReassign, which the service never checks. confirmFaceSuggestion ALSO enforces PersonCreate on
  // the face itself (assetFaceId), but the guard can only carry one permission; that face-level check
  // stays service-level (see the comment on confirmFaceSuggestion in person.service.ts). Do not drop it
  // there on the assumption this decorator covers it.
  //
  // S11 (F24): the response EXPLICITLY reports whether the call acted or was a no-op — the service's return
  // value, not a fixed default. The web modal used to infer "already resolved" from a 400, which is
  // indistinguishable from a genuine authorization failure (see the comment that used to sit here and on
  // PersonSuggestionReviewModal.svelte).
  //
  // S11b (F24): that report is the `acted` field of the BODY, always under 200 — NOT a 200-vs-204 status
  // code. @oazapfts/runtime's ok() resolves to the body and throws away the numeric status for every
  // success code, so no generated client can read a status-code signal. Do not "simplify" this back to
  // @HttpCode + res.status(): it compiles, tests green against supertest, and is unusable from the SDK.
  @Post(':id/face-suggestions/:assetFaceId/confirm')
  @Authenticated({ permission: Permission.PersonUpdate })
  @HttpCode(HttpStatus.OK)
  @Endpoint({
    summary: 'Confirm a face suggestion',
    description: 'Assign the suggested face to the person. Idempotent — the response reports whether it acted.',
    history: new HistoryBuilder().added('v1').beta('v1'),
  })
  async confirmPersonFaceSuggestion(
    @Auth() auth: AuthDto,
    @Param() { id, assetFaceId }: PersonFaceSuggestionParamsDto,
  ): Promise<FaceSuggestionActionResponseDto> {
    return { acted: await this.service.confirmFaceSuggestion(auth, id, assetFaceId) };
  }

  @Post(':id/face-suggestions/:assetFaceId/reject')
  @Authenticated({ permission: Permission.PersonUpdate })
  @HttpCode(HttpStatus.OK)
  @Endpoint({
    summary: 'Reject a face suggestion',
    description:
      'Reject this suggestion for the person. The face stays unassigned. Idempotent — the response reports whether it acted.',
    history: new HistoryBuilder().added('v1').beta('v1'),
  })
  async rejectPersonFaceSuggestion(
    @Auth() auth: AuthDto,
    @Param() { id, assetFaceId }: PersonFaceSuggestionParamsDto,
  ): Promise<FaceSuggestionActionResponseDto> {
    return { acted: await this.service.rejectFaceSuggestion(auth, id, assetFaceId) };
  }

  @Post(':id/face-suggestions/:assetFaceId/ignore')
  @Authenticated({ permission: Permission.PersonUpdate })
  @HttpCode(HttpStatus.OK)
  @Endpoint({
    summary: 'Ignore a face suggestion',
    description:
      'Ignore this suggestion for the person. The face stays unassigned. Idempotent — the response reports whether it acted.',
    history: new HistoryBuilder().added('v1').beta('v1'),
  })
  async ignorePersonFaceSuggestion(
    @Auth() auth: AuthDto,
    @Param() { id, assetFaceId }: PersonFaceSuggestionParamsDto,
  ): Promise<FaceSuggestionActionResponseDto> {
    return { acted: await this.service.ignoreFaceSuggestion(auth, id, assetFaceId) };
  }

  @Post(':id/face-suggestions/:assetFaceId/dismiss')
  @Authenticated({ permission: Permission.PersonUpdate })
  @HttpCode(HttpStatus.OK)
  @Endpoint({
    summary: 'Dismiss a face suggestion',
    description:
      'Compatibility alias for rejecting this suggestion. The face stays unassigned. Idempotent — the response reports whether it acted.',
    history: new HistoryBuilder().added('v1').beta('v1'),
  })
  async dismissPersonFaceSuggestion(
    @Auth() auth: AuthDto,
    @Param() { id, assetFaceId }: PersonFaceSuggestionParamsDto,
  ): Promise<FaceSuggestionActionResponseDto> {
    return { acted: await this.service.dismissFaceSuggestion(auth, id, assetFaceId) };
  }
}
