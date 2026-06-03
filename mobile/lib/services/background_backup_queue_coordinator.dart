import 'dart:async';

import 'package:background_downloader/background_downloader.dart';
import 'package:immich_mobile/constants/constants.dart';
import 'package:immich_mobile/services/background_backup_status.service.dart';
import 'package:immich_mobile/services/background_upload.service.dart';
import 'package:logging/logging.dart';

abstract interface class BackgroundBackupQueuePort {
  Future<List<Task>> getActiveTasks(String group);
  Future<BackgroundBackupQueueResult> enqueueNextBackupBatch(
    String userId, {
    Set<String> excludedLocalAssetIds,
  });
  Future<void> resume();
  Future<int> cancel();
}

class BackgroundBackupQueueCoordinator {
  BackgroundBackupQueueCoordinator(this._queue, {BackgroundBackupStatusService? statusService})
    : _statusService = statusService;

  final BackgroundBackupQueuePort _queue;
  final BackgroundBackupStatusService? _statusService;
  final Logger _logger = Logger('BackgroundBackupQueueCoordinator');

  String? _activeUserId;
  int _sessionGeneration = 0;
  Future<void>? _refillTail;
  int _remainingEligibleCount = 0;
  final Set<String> _queuedLocalAssetIds = {};
  final Set<String> _completedLocalAssetIds = {};
  final Set<String> _failedLocalAssetIds = {};
  final Set<String> _skippedLocalAssetIds = {};
  final Set<String> _enqueueFailedLocalAssetIds = {};

  bool get isActive => _activeUserId != null;

  Future<void> start(String userId) async {
    _activeUserId = userId;
    final generation = ++_sessionGeneration;
    _logger.info('Starting background backup session');

    final activeTasks = await _activeTasks();
    if (!_isCurrentSession(userId, generation)) {
      return;
    }

    if (activeTasks.isNotEmpty) {
      _queuedLocalAssetIds.addAll(activeTasks.map((task) => task.taskId));
      _logger.info('Resuming ${activeTasks.length} active background backup tasks');
      await _queue.resume();
      return;
    }

    await _enqueueNextBatch(userId, generation);
  }

  Future<void> stop() async {
    _activeUserId = null;
    _sessionGeneration++;
    _clearSessionSets();
    await _queue.cancel();
  }

  Future<void> handleStatus(TaskStatusUpdate update) {
    final userId = _activeUserId;
    if (userId == null || !_isBackupTask(update.task)) {
      return Future.value();
    }
    final generation = _sessionGeneration;
    _refillTail = (_refillTail ?? Future.value()).then((_) async {
      try {
        _recordTerminalStatus(update);
        await _refillIfDrained(userId, generation);
      } catch (error, stackTrace) {
        _logger.severe('Background backup refill failed', error, stackTrace);
      }
    });
    return _refillTail!;
  }

  void _recordTerminalStatus(TaskStatusUpdate update) {
    var removedLogicalAsset = false;

    switch (update.status) {
      case TaskStatus.complete:
        if (!_isLivePhotoMotionTask(update.task) && _queuedLocalAssetIds.remove(update.task.taskId)) {
          _completedLocalAssetIds.add(update.task.taskId);
          removedLogicalAsset = true;
        }
        break;
      case TaskStatus.failed:
      case TaskStatus.notFound:
      case TaskStatus.canceled:
        if (_queuedLocalAssetIds.remove(update.task.taskId)) {
          _failedLocalAssetIds.add(update.task.taskId);
          removedLogicalAsset = true;
        }
        break;
      default:
        break;
    }

    if (removedLogicalAsset && _remainingEligibleCount > 0) {
      _remainingEligibleCount--;
    }
  }

  Future<void> _refillIfDrained(String userId, int generation) async {
    if (!_isCurrentSession(userId, generation)) {
      return;
    }

    final activeTasks = await _activeTasks();
    if (!_isCurrentSession(userId, generation) || activeTasks.isNotEmpty) {
      return;
    }

    await _enqueueNextBatch(userId, generation);
  }

  Future<void> _enqueueNextBatch(String userId, int generation) async {
    while (true) {
      final BackgroundBackupQueueResult result;
      try {
        result = await _queue.enqueueNextBackupBatch(
          userId,
          excludedLocalAssetIds: _excludedLocalAssetIds(),
        );
      } catch (error, stackTrace) {
        _logger.severe('Background backup enqueue failed; ending session', error, stackTrace);
        if (_isCurrentSession(userId, generation)) {
          _activeUserId = null;
        }
        return;
      }

      if (!_isCurrentSession(userId, generation)) {
        return;
      }

      _queuedLocalAssetIds.addAll(result.enqueuedLocalAssetIds);
      _skippedLocalAssetIds.addAll(result.skippedLocalAssetIds);
      _enqueueFailedLocalAssetIds.addAll(result.enqueueFailedLocalAssetIds);

      _remainingEligibleCount = result.remainingEligibleCandidateCount;
      await _recordProgress();

      if (result.queuedAny) {
        _logger.info('Enqueued ${result.enqueuedCount} background backup tasks');
        return;
      }

      if (!result.hasMoreEligibleCandidates) {
        _logger.info('Background backup session complete');
        await _statusService?.recordBackupComplete();
        _activeUserId = null;
        return;
      }

      // No tasks were enqueued (all skipped or enqueue-failed) but more eligible
      // candidates remain. No completion callback will arrive to drive the next
      // refill, so advance to the next window now. The exclusion sets grow by the
      // whole window each iteration, so this is guaranteed to converge.
      _logger.info('Batch produced no tasks; advancing to the next window');
    }
  }

  Set<String> _excludedLocalAssetIds() {
    return {
      ..._queuedLocalAssetIds,
      ..._completedLocalAssetIds,
      ..._failedLocalAssetIds,
      ..._skippedLocalAssetIds,
      ..._enqueueFailedLocalAssetIds,
    };
  }

  Future<List<Task>> _activeTasks() async {
    final groups = await Future.wait([
      _queue.getActiveTasks(kBackupGroup),
      _queue.getActiveTasks(kBackupLivePhotoGroup),
    ]);
    return groups.expand((group) => group).toList(growable: false);
  }

  bool _isCurrentSession(String userId, int generation) {
    return _activeUserId == userId && _sessionGeneration == generation;
  }

  bool _isBackupTask(Task task) {
    return task.group == kBackupGroup || task.group == kBackupLivePhotoGroup;
  }

  bool _isLivePhotoMotionTask(Task task) {
    if (task.group != kBackupGroup || task.metaData.isEmpty) {
      return false;
    }
    try {
      return UploadTaskMetadata.fromJson(task.metaData).isLivePhotos;
    } catch (_) {
      return false;
    }
  }

  Future<void> _recordProgress() {
    return _statusService?.recordQueueProgress(
          queuedCount: _queuedLocalAssetIds.length,
          completedCount: _completedLocalAssetIds.length,
          failedCount: _failedLocalAssetIds.length,
          skippedCount: _skippedLocalAssetIds.length,
          enqueueFailedCount: _enqueueFailedLocalAssetIds.length,
          remainingCount: _remainingEligibleCount,
        ) ??
        Future.value();
  }

  void _clearSessionSets() {
    _queuedLocalAssetIds.clear();
    _completedLocalAssetIds.clear();
    _failedLocalAssetIds.clear();
    _skippedLocalAssetIds.clear();
    _enqueueFailedLocalAssetIds.clear();
  }
}
