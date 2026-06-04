import 'dart:convert';

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/background_backup_status.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';

final backgroundBackupStatusServiceProvider = Provider<BackgroundBackupStatusService>(
  (_) => BackgroundBackupStatusService(store: Store),
);

class BackgroundBackupStatusService {
  BackgroundBackupStatusService({required this.store, DateTime Function()? now}) : _now = now ?? DateTime.now;

  final StoreService store;
  final DateTime Function() _now;

  // The coordinator drives cumulative session counts and calls recordQueueProgress
  // / recordQueueDrained / recordBackupComplete. It calls recordSessionStart at
  // the top of each backup session to zero the counts and clear any prior failure
  // reason. Each mutation goes through a single tail future so concurrent calls
  // cannot clobber each other.
  Future<void> _writeTail = Future.value();

  // `read()` is intentionally NOT serialized — it is a pure load with no write.
  Future<BackgroundBackupStatus> read() async {
    final raw = store.tryGet(StoreKey.backgroundBackupStatus);
    if (raw == null || raw.isEmpty) {
      return const BackgroundBackupStatus();
    }
    return BackgroundBackupStatus.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  /// Serializes a read-modify-write so concurrent record* calls cannot clobber.
  Future<void> _mutate(BackgroundBackupStatus Function(BackgroundBackupStatus current) update) {
    final next = _writeTail.then((_) async {
      final current = await read();
      await store.put(StoreKey.backgroundBackupStatus, jsonEncode(update(current).toJson()));
    });
    // Keep the tail alive even if one mutation throws.
    _writeTail = next.catchError((_) {});
    return next;
  }

  Future<void> recordWake(BackgroundBackupSchedulerKind schedulerKind) {
    return _mutate(
      (current) => current.copyWith(
        lastBackgroundWakeAt: _now(),
        lastSuccessfulSchedulerKind: schedulerKind,
        lastBackgroundFailureReason: BackgroundBackupFailureReason.none,
      ),
    );
  }

  Future<void> recordCandidateCount(int count) {
    return _mutate((current) => current.copyWith(lastLocalPhotoScanAt: _now(), lastCandidateCount: count));
  }

  Future<void> recordUploadEnqueue({required int candidateCount}) {
    return _mutate(
      (current) => current.copyWith(
        lastUploadEnqueueAt: _now(),
        lastCandidateCount: candidateCount,
        lastBackgroundFailureReason: BackgroundBackupFailureReason.none,
      ),
    );
  }

  Future<void> recordUploadSuccess() {
    return _mutate(
      (current) => current.copyWith(
        lastUploadSuccessAt: _now(),
        lastCandidateCount: 0,
        lastBackgroundFailureReason: BackgroundBackupFailureReason.none,
      ),
    );
  }

  Future<void> recordFailure(BackgroundBackupFailureReason reason) {
    return _mutate((current) => current.copyWith(lastBackgroundFailureReason: reason));
  }

  Future<void> recordQueueProgress({
    required int queuedCount,
    required int completedCount,
    required int failedCount,
    required int skippedCount,
    required int enqueueFailedCount,
    required int remainingCount,
  }) {
    return _mutate(
      (current) => current.copyWith(
        lastQueuedCount: queuedCount,
        lastCompletedCount: completedCount,
        lastFailedCount: failedCount,
        lastSkippedCount: skippedCount,
        lastEnqueueFailedCount: enqueueFailedCount,
        lastRemainingCount: remainingCount,
        lastUploadEnqueueAt: queuedCount > current.lastQueuedCount ? _now() : current.lastUploadEnqueueAt,
        lastUploadSuccessAt: completedCount > current.lastCompletedCount ? _now() : current.lastUploadSuccessAt,
        lastBackgroundFailureReason: failedCount > 0
            ? BackgroundBackupFailureReason.uploadFailed
            : BackgroundBackupFailureReason.none,
      ),
    );
  }

  Future<void> recordSessionStart() {
    return _mutate(
      (current) => current.copyWith(
        lastQueuedCount: 0,
        lastCompletedCount: 0,
        lastFailedCount: 0,
        lastSkippedCount: 0,
        lastEnqueueFailedCount: 0,
        lastRemainingCount: 0,
        lastBackgroundFailureReason: BackgroundBackupFailureReason.none,
      ),
    );
  }

  Future<void> recordQueueDrained({required int remainingCount}) {
    return _mutate((current) => current.copyWith(lastQueueDrainedAt: _now(), lastRemainingCount: remainingCount));
  }

  Future<void> recordBackupComplete() {
    return _mutate(
      (current) => current.copyWith(
        lastFullBackupCompletedAt: _now(),
        lastCandidateCount: 0,
        lastQueuedCount: 0,
        lastCompletedCount: 0,
        lastFailedCount: 0,
        lastSkippedCount: 0,
        lastEnqueueFailedCount: 0,
        lastRemainingCount: 0,
        lastBackgroundFailureReason: BackgroundBackupFailureReason.none,
      ),
    );
  }

  Future<void> markReminderShown() {
    return _mutate((current) => current.copyWith(lastReminderAt: _now()));
  }
}
