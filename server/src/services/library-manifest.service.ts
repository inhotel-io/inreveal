import { Injectable, NotFoundException } from '@nestjs/common';
import { MANIFEST_PAGE_SIZE, MANIFEST_SCHEMA_VERSION } from 'src/constants';
import { AuthDto } from 'src/dtos/auth.dto';
import { LibraryManifestAssetDto, LibraryManifestResponseDto } from 'src/dtos/library-manifest.dto';
import { BaseService } from 'src/services/base.service';
import { hexOrBufferToBase64 } from 'src/utils/bytes';
import { asDateString } from 'src/utils/date';

@Injectable()
export class LibraryManifestService extends BaseService {
  async getManifest(auth: AuthDto, id: string): Promise<LibraryManifestResponseDto> {
    const user = await this.userRepository.get(id, { withDeleted: true });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const rows = await this.assetRepository.getOwnedManifestAssets(id, MANIFEST_PAGE_SIZE);

    const assets: LibraryManifestAssetDto[] = rows.map((row) => ({
      assetId: row.id,
      objectKey: row.originalPath,
      originalFileName: row.originalFileName,
      checksum: hexOrBufferToBase64(row.checksum)!,
      checksumAlgorithm: row.checksumAlgorithm,
      size: row.size ?? null,
      type: row.type,
      fileCreatedAt: asDateString(row.fileCreatedAt),
      fileModifiedAt: asDateString(row.fileModifiedAt),
      albumIds: [],
    }));

    return {
      manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      owner: { id: user.id, email: user.email },
      albums: [],
      assets,
      nextCursor: null,
    };
  }
}
