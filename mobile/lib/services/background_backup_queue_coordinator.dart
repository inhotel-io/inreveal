import 'dart:async';

import 'package:background_downloader/background_downloader.dart';
import 'package:immich_mobile/constants/constants.dart';
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
  BackgroundBackupQueueCoordinator(this._queue);

  final BackgroundBackupQueuePort _queue;
  final Logger _logger = Logger('BackgroundBackupQueueCoordinator');

  String? _activeUserId;
  int _sessionGeneration = 0;
  Future<void>? _refillTail;
  final Set<String> _queuedLocalAssetIds = {};
  final Set<String> _completedLocalAssetIds = {};
  final Set<String> _failedLocalAssetIds = {};
  final Set<String> _skippedLocalAssetIds = {};
  final Set<String> _enqueueFailedLocalAssetIds = {};

  bool get isActive => _activeUserId != null;

  Future<void> start(String userId) async {
    _activeUserId = userId;
    final generation = ++_sessionGeneration;

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
      _recordTerminalStatus(update);
      await _refillIfDrained(userId, generation);
    });
    return _refillTail!;
  }

  void _recordTerminalStatus(TaskStatusUpdate update) {
    switch (update.status) {
      case TaskStatus.complete:
        if (!_isLivePhotoMotionTask(update.task)) {
          _queuedLocalAssetIds.remove(update.task.taskId);
          _completedLocalAssetIds.add(update.task.taskId);
        }
        break;
      case TaskStatus.failed:
      case TaskStatus.notFound:
      case TaskStatus.canceled:
        _queuedLocalAssetIds.remove(update.task.taskId);
        _failedLocalAssetIds.add(update.task.taskId);
        break;
      default:
        break;
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
    final result = await _queue.enqueueNextBackupBatch(
      userId,
      excludedLocalAssetIds: _excludedLocalAssetIds(),
    );
    if (!_isCurrentSession(userId, generation)) {
      return;
    }

    _queuedLocalAssetIds.addAll(result.enqueuedLocalAssetIds);
    _skippedLocalAssetIds.addAll(result.skippedLocalAssetIds);
    _enqueueFailedLocalAssetIds.addAll(result.enqueueFailedLocalAssetIds);

    if (!result.queuedAny && !result.hasMoreEligibleCandidates) {
      _activeUserId = null;
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

  void _clearSessionSets() {
    _queuedLocalAssetIds.clear();
    _completedLocalAssetIds.clear();
    _failedLocalAssetIds.clear();
    _skippedLocalAssetIds.clear();
    _enqueueFailedLocalAssetIds.clear();
  }
}
