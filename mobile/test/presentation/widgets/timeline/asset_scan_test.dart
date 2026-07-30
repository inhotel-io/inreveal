import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/presentation/widgets/timeline/asset_scan.dart';

void main() {
  group('assetScanChunks', () {
    List<({int index, int count})> chunks({int firstAssetIndex = 0, required int assetCount, int chunkSize = 250}) =>
        assetScanChunks(firstAssetIndex: firstAssetIndex, assetCount: assetCount, chunkSize: chunkSize).toList();

    test('an empty segment yields no chunks', () {
      expect(chunks(assetCount: 0), isEmpty);
    });

    test('a negative assetCount yields no chunks', () {
      expect(chunks(assetCount: -5), isEmpty);
    });

    test('fewer assets than the chunk size yields one exact chunk', () {
      expect(chunks(assetCount: 10, chunkSize: 250), [(index: 0, count: 10)]);
    });

    test('exactly one chunk size yields one chunk', () {
      expect(chunks(assetCount: 250, chunkSize: 250), [(index: 0, count: 250)]);
    });

    test('one more than a chunk size yields two chunks, the second of count 1', () {
      expect(chunks(assetCount: 251, chunkSize: 250), [(index: 0, count: 250), (index: 250, count: 1)]);
    });

    test('chunks are contiguous and their counts sum to assetCount', () {
      final result = chunks(assetCount: 1003, chunkSize: 250);

      expect(result.fold<int>(0, (sum, c) => sum + c.count), 1003);
      for (var i = 1; i < result.length; i++) {
        expect(result[i].index, result[i - 1].index + result[i - 1].count);
      }
    });

    test('chunks start at a non-zero firstAssetIndex', () {
      expect(chunks(firstAssetIndex: 1000, assetCount: 300, chunkSize: 250), [
        (index: 1000, count: 250),
        (index: 1250, count: 50),
      ]);
    });

    test('a chunkSize of zero is clamped to one so the sequence stays finite', () {
      // A zero or negative chunk size would otherwise yield nothing (a silent
      // "asset not found") or loop forever.
      expect(chunks(assetCount: 3, chunkSize: 0), [(index: 0, count: 1), (index: 1, count: 1), (index: 2, count: 1)]);
    });

    test('a negative chunkSize is clamped to one', () {
      expect(chunks(assetCount: 2, chunkSize: -10), [(index: 0, count: 1), (index: 1, count: 1)]);
    });
  });
}
