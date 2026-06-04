import 'package:background_downloader/background_downloader.dart';

/// Result of attempting to enqueue one bounded background-backup batch.
class BackgroundBackupQueueResult {
  const BackgroundBackupQueueResult({
    required this.totalCandidateCount,
    required this.eligibleCandidateCount,
    required this.enqueuedLocalAssetIds,
    required this.skippedLocalAssetIds,
    required this.enqueueFailedLocalAssetIds,
    required this.remainingEligibleCandidateCount,
  });

  final int totalCandidateCount;
  final int eligibleCandidateCount;
  final List<String> enqueuedLocalAssetIds;
  final List<String> skippedLocalAssetIds;
  final List<String> enqueueFailedLocalAssetIds;
  final int remainingEligibleCandidateCount;

  int get enqueuedCount => enqueuedLocalAssetIds.length;
  bool get queuedAny => enqueuedLocalAssetIds.isNotEmpty;
  bool get hasMoreEligibleCandidates => remainingEligibleCandidateCount > 0;
}

/// The queue operations the backup coordinator needs from the upload service.
abstract interface class BackgroundBackupQueuePort {
  Future<List<Task>> getActiveTasks(String group);
  Future<BackgroundBackupQueueResult> enqueueNextBackupBatch(String userId, {Set<String> excludedLocalAssetIds});
  Future<void> resume();
  Future<int> cancel();
}
