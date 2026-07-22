import { AssetResponseDto } from 'src/dtos/asset-response.dto';

/**
 * Counts all truthy values in the exifInfo object.
 * This matches the client implementation in web/src/lib/utils/exif-utils.ts
 *
 * @param asset Asset with optional exifInfo
 * @returns Count of truthy EXIF values
 */
export const getExifCount = (asset: AssetResponseDto): number => {
  return Object.values(asset.exifInfo ?? {}).filter(Boolean).length;
};

/** Ranks two duplicate candidates: larger file size wins, EXIF count breaks the tie. */
const compareCandidates = (a: AssetResponseDto, b: AssetResponseDto): number =>
  (a.exifInfo?.fileSizeInByte ?? 0) - (b.exifInfo?.fileSizeInByte ?? 0) || getExifCount(a) - getExifCount(b);

/**
 * Suggests the best duplicate asset to keep from a list of duplicates.
 * This is a direct port of the client logic from web/src/lib/utils/duplicate-utils.ts
 *
 * The best asset is determined by the following criteria:
 *  1. Largest image file size in bytes
 *  2. Largest count of EXIF data (as tie-breaker)
 *
 * @param assets List of duplicate assets
 * @returns The best asset to keep, or undefined if empty list
 */
export const suggestDuplicate = (assets: AssetResponseDto[]): AssetResponseDto | undefined => {
  let best: AssetResponseDto | undefined;
  for (const asset of assets) {
    // `>= 0` keeps the *last* of fully tied candidates, matching the original sort-and-take-last.
    if (!best || compareCandidates(asset, best) >= 0) {
      best = asset;
    }
  }
  return best;
};

/**
 * Suggests the best duplicate asset IDs to keep from a list of duplicates.
 * Returns an array with a single asset ID (the best candidate), or empty if no assets.
 *
 * @param assets List of duplicate assets
 * @returns Array of suggested asset IDs to keep (0 or 1 element)
 */
export const suggestDuplicateKeepAssetIds = (assets: AssetResponseDto[]): string[] => {
  const suggested = suggestDuplicate(assets);
  return suggested ? [suggested.id] : [];
};
