# iOS Full Backup TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make iOS URLSession backup reliable for full-library backups with thousands of assets, independent of UI navigation, without reintroducing the TestFlight crash during background worker teardown.

**Architecture:** Treat iOS background backup as an explicit queue session owned by a coordinator. The coordinator owns queued, completed, failed, skipped, and enqueue-failed local asset IDs for the session; it refills bounded URLSession batches when both backup groups drain; and it records persisted progress from session state instead of per-task service callbacks. `BackgroundUploadService` only builds/enqueues bounded batches and reports exact enqueue results.

**Tech Stack:** Flutter/Dart, Riverpod StateNotifier, `background_downloader`, Drift repositories, `flutter_test`, `mocktail`, existing background backup status persistence.

---

## Root Cause And Required Contract

Device logs showed uploads themselves were healthy: `nsurlsessiond` sent requests, returned `response_status=200`/`201`, and completed tasks for `de.opennoodle.gallery`. The failure was lifecycle ownership: after native URLSession outstanding tasks reached `0`, new candidates were queued only when a UI path called `startBackupWithURLSession()` again. A full backup must instead satisfy this invariant:

```text
While an iOS backup session is active:
  if both backup URLSession groups have no active tasks,
  and there are eligible candidates not already handled by this session,
  enqueue exactly one next bounded batch without relying on UI navigation.
```

The coordinator must exclude these IDs during the current session:

- queued IDs: native URLSession owns them now.
- completed IDs: remote sync may not yet have removed them from `getCandidates()`.
- failed upload IDs: avoid immediate retry loops in the same session.
- skipped IDs: asset entity/file was unavailable in this session.
- enqueue-failed IDs: `enqueueAll` returned `false` for them.

## File Structure

- Create: `mobile/lib/services/background_backup_queue_coordinator.dart`
  - Owns iOS backup session lifecycle and refill decisions.
  - Tracks session exclusion sets.
  - Serializes refill checks so concurrent terminal callbacks cannot enqueue duplicate batches.
  - Records status progress from session state.

- Create: `mobile/test/services/background_backup_queue_coordinator_test.dart`
  - Pure fake-driven tests for 3,517 assets, UI-independent refill, restart, concurrent callbacks, cancellation, failed tasks, enqueue failures, skipped files, and Live Photos.

- Modify: `mobile/lib/services/background_upload.service.dart`
  - Implements `BackgroundBackupQueuePort`.
  - Adds `BackgroundBackupQueueResult`.
  - Adds `enqueueNextBackupBatch()` with exact bounded-batch semantics.
  - Keeps existing task construction and iOS notification behavior.

- Modify: `mobile/test/services/background_upload.service_test.dart`
  - Adds result semantics coverage for excluded IDs, empty filtered candidates, skipped files, and mixed native enqueue results.

- Modify: `mobile/lib/providers/backup/drift_backup.provider.dart`
  - Delegates iOS queue lifecycle to the coordinator.
  - Keeps foreground upload and UI state updates.

- Create: `mobile/lib/providers/backup/background_backup_queue.provider.dart`
  - Provides `BackgroundBackupQueueCoordinator` without a provider/service import cycle.

- Modify: `mobile/test/providers/backup/drift_backup_provider_test.dart`
  - Verifies iOS provider delegation and no UI-count refresh dependency.

- Modify: `mobile/lib/services/background_backup_status.service.dart`
  - Adds queue progress methods used by the coordinator.

- Modify: `mobile/lib/domain/models/background_backup_status.model.dart`
  - Adds queued/completed/failed/skipped/enqueue-failed/remaining/full-complete fields.

- Modify: `mobile/test/services/background_backup_status.service_test.dart`
  - Tests persistence semantics for large in-progress backups.

- Modify: `mobile/test/domain/models/background_backup_status_model_test.dart`
  - Tests serialization defaults and round trips for new fields.

- Create: `mobile/tool/observe_ios_background_backup.sh`
  - Filters device logs for Noodle-specific URLSession activity.

---

### Task 1: Add Exact Bounded-Batch Result Semantics

**Files:**

- Modify: `mobile/lib/services/background_upload.service.dart`
- Modify: `mobile/test/services/background_upload.service_test.dart`

- [ ] **Step 1: Write failing tests for bounded batch results**

Add these tests to `mobile/test/services/background_upload.service_test.dart` inside `group('background backup status recording', ...)`:

```dart
test('enqueueNextBackupBatch queues one bounded eligible batch and reports exact counts', () async {
  debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  addTearDown(() => debugDefaultTargetPlatformOverride = null);

  sut.backupBatchSize = 100;
  final candidates = List.generate(
    250,
    (index) => LocalAssetStub.image1.copyWith(id: 'asset-$index', name: 'asset-$index.jpg'),
  );
  final mockEntity = MockAssetEntity();
  when(() => mockEntity.isLivePhoto).thenReturn(false);

  when(() => mockStorageRepository.clearCache()).thenAnswer((_) async {});
  when(() => mockBackupRepository.getCandidates('user-1')).thenAnswer((_) async => candidates);
  when(() => mockUploadRepository.disableHoldingQueue()).thenAnswer((_) async {});
  when(() => mockUploadRepository.restoreDefaultHoldingQueue()).thenAnswer((_) async {});
  when(() => mockUploadRepository.enqueueBackgroundAll(any())).thenAnswer((invocation) async {
    final tasks = invocation.positionalArguments.single as List<UploadTask>;
    return List.filled(tasks.length, true);
  });
  when(() => mockUploadRepository.updateNotification(any(), TaskStatus.enqueued)).thenAnswer((_) async {});

  for (final asset in candidates) {
    when(() => mockStorageRepository.getAssetEntityForAsset(asset)).thenAnswer((_) async => mockEntity);
    when(() => mockStorageRepository.getFileForAsset(asset.id)).thenAnswer((_) async => File('/path/${asset.id}.jpg'));
    when(() => mockAssetMediaRepository.getOriginalFilename(asset.id)).thenAnswer((_) async => asset.name);
  }

  final result = await sut.enqueueNextBackupBatch(
    'user-1',
    excludedLocalAssetIds: {'asset-0', 'asset-1'},
  );

  final batch = verify(() => mockUploadRepository.enqueueBackgroundAll(captureAny())).captured.single as List<UploadTask>;
  expect(batch.map((task) => task.taskId), List.generate(100, (index) => 'asset-${index + 2}'));
  expect(result.totalCandidateCount, 250);
  expect(result.eligibleCandidateCount, 248);
  expect(result.enqueuedLocalAssetIds, List.generate(100, (index) => 'asset-${index + 2}'));
  expect(result.skippedLocalAssetIds, isEmpty);
  expect(result.enqueueFailedLocalAssetIds, isEmpty);
  expect(result.remainingEligibleCandidateCount, 148);
  expect(result.queuedAny, true);
  expect(result.hasMoreEligibleCandidates, true);
});

test('enqueueNextBackupBatch does not loop when every candidate is excluded', () async {
  sut.backupBatchSize = 100;
  final candidates = List.generate(
    3,
    (index) => LocalAssetStub.image1.copyWith(id: 'asset-$index', name: 'asset-$index.jpg'),
  );

  when(() => mockStorageRepository.clearCache()).thenAnswer((_) async {});
  when(() => mockBackupRepository.getCandidates('user-1')).thenAnswer((_) async => candidates);

  final result = await sut.enqueueNextBackupBatch(
    'user-1',
    excludedLocalAssetIds: {'asset-0', 'asset-1', 'asset-2'},
  );

  expect(result.totalCandidateCount, 3);
  expect(result.eligibleCandidateCount, 0);
  expect(result.enqueuedLocalAssetIds, isEmpty);
  expect(result.remainingEligibleCandidateCount, 0);
  expect(result.queuedAny, false);
  expect(result.hasMoreEligibleCandidates, false);
  verifyNever(() => mockUploadRepository.enqueueBackgroundAll(any()));
});

test('enqueueNextBackupBatch reports skipped files and mixed native enqueue failures', () async {
  debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  addTearDown(() => debugDefaultTargetPlatformOverride = null);

  sut.backupBatchSize = 4;
  final candidates = List.generate(
    4,
    (index) => LocalAssetStub.image1.copyWith(id: 'asset-$index', name: 'asset-$index.jpg'),
  );
  final mockEntity = MockAssetEntity();
  when(() => mockEntity.isLivePhoto).thenReturn(false);

  when(() => mockStorageRepository.clearCache()).thenAnswer((_) async {});
  when(() => mockBackupRepository.getCandidates('user-1')).thenAnswer((_) async => candidates);
  when(() => mockUploadRepository.disableHoldingQueue()).thenAnswer((_) async {});
  when(() => mockUploadRepository.restoreDefaultHoldingQueue()).thenAnswer((_) async {});
  when(() => mockUploadRepository.enqueueBackgroundAll(any())).thenAnswer((_) async => [true, false, true]);
  when(() => mockUploadRepository.updateNotification(any(), TaskStatus.enqueued)).thenAnswer((_) async {});

  for (final asset in candidates) {
    when(() => mockStorageRepository.getAssetEntityForAsset(asset)).thenAnswer((_) async => mockEntity);
    when(() => mockAssetMediaRepository.getOriginalFilename(asset.id)).thenAnswer((_) async => asset.name);
  }
  when(() => mockStorageRepository.getFileForAsset('asset-0')).thenAnswer((_) async => File('/path/asset-0.jpg'));
  when(() => mockStorageRepository.getFileForAsset('asset-1')).thenAnswer((_) async => null);
  when(() => mockStorageRepository.getFileForAsset('asset-2')).thenAnswer((_) async => File('/path/asset-2.jpg'));
  when(() => mockStorageRepository.getFileForAsset('asset-3')).thenAnswer((_) async => File('/path/asset-3.jpg'));

  final result = await sut.enqueueNextBackupBatch('user-1');

  expect(result.enqueuedLocalAssetIds, ['asset-0', 'asset-3']);
  expect(result.skippedLocalAssetIds, ['asset-1']);
  expect(result.enqueueFailedLocalAssetIds, ['asset-2']);
  expect(result.remainingEligibleCandidateCount, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd mobile
mise exec -- flutter test test/services/background_upload.service_test.dart --plain-name "enqueueNextBackupBatch"
```

Expected: FAIL because `enqueueNextBackupBatch`, `backupBatchSize`, and the new result fields do not exist.

- [ ] **Step 3: Add result type and method**

Add near `UploadTaskMetadata` in `mobile/lib/services/background_upload.service.dart`:

```dart
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
```

Add to `BackgroundUploadService`:

```dart
@visibleForTesting
int backupBatchSize = 100;

Future<BackgroundBackupQueueResult> enqueueNextBackupBatch(
  String userId, {
  Set<String> excludedLocalAssetIds = const {},
}) async {
  await _storageRepository.clearCache();
  shouldAbortQueuingTasks = false;

  final candidates = await _backupRepository.getCandidates(userId);
  await _backgroundBackupStatusService.recordCandidateCount(candidates.length);

  final eligibleCandidates = candidates
      .where((candidate) => !excludedLocalAssetIds.contains(candidate.id))
      .toList(growable: false);
  final batchCandidates = eligibleCandidates.take(backupBatchSize).toList(growable: false);

  final tasks = <UploadTask>[];
  final skippedLocalAssetIds = <String>[];
  for (final asset in batchCandidates) {
    if (shouldAbortQueuingTasks) {
      break;
    }

    final task = await getUploadTask(asset);
    if (task == null) {
      skippedLocalAssetIds.add(asset.id);
      continue;
    }
    tasks.add(task);
  }

  if (tasks.isEmpty || shouldAbortQueuingTasks) {
    return BackgroundBackupQueueResult(
      totalCandidateCount: candidates.length,
      eligibleCandidateCount: eligibleCandidates.length,
      enqueuedLocalAssetIds: const [],
      skippedLocalAssetIds: skippedLocalAssetIds,
      enqueueFailedLocalAssetIds: const [],
      remainingEligibleCandidateCount: eligibleCandidates.length - skippedLocalAssetIds.length,
    );
  }

  final results = await enqueueTasks(tasks);
  final enqueuedLocalAssetIds = <String>[];
  final enqueueFailedLocalAssetIds = <String>[];

  for (var i = 0; i < tasks.length; i++) {
    final success = i < results.length && results[i];
    if (success) {
      enqueuedLocalAssetIds.add(tasks[i].taskId);
    } else {
      enqueueFailedLocalAssetIds.add(tasks[i].taskId);
    }
  }

  return BackgroundBackupQueueResult(
    totalCandidateCount: candidates.length,
    eligibleCandidateCount: eligibleCandidates.length,
    enqueuedLocalAssetIds: enqueuedLocalAssetIds,
    skippedLocalAssetIds: skippedLocalAssetIds,
    enqueueFailedLocalAssetIds: enqueueFailedLocalAssetIds,
    remainingEligibleCandidateCount:
        eligibleCandidates.length -
        enqueuedLocalAssetIds.length -
        skippedLocalAssetIds.length -
        enqueueFailedLocalAssetIds.length,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd mobile
mise exec -- flutter test test/services/background_upload.service_test.dart --plain-name "enqueueNextBackupBatch"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/services/background_upload.service.dart mobile/test/services/background_upload.service_test.dart
git commit -m "test(mobile): define bounded background backup enqueue results"
```

---

### Task 2: Build The Coordinator With Full-Backup Red Tests First

**Files:**

- Create: `mobile/lib/services/background_backup_queue_coordinator.dart`
- Create: `mobile/test/services/background_backup_queue_coordinator_test.dart`
- Modify: `mobile/lib/services/background_upload.service.dart`

- [ ] **Step 1: Write failing coordinator tests**

Create `mobile/test/services/background_backup_queue_coordinator_test.dart`:

```dart
import 'dart:async';

import 'package:background_downloader/background_downloader.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/constants/constants.dart';
import 'package:immich_mobile/services/background_backup_queue_coordinator.dart';
import 'package:immich_mobile/services/background_upload.service.dart';

class FakeBackgroundUploadQueue implements BackgroundBackupQueuePort {
  FakeBackgroundUploadQueue({Iterable<String> candidateIds = const []}) {
    this.candidateIds.addAll(candidateIds);
  }

  final candidateIds = <String>[];
  final activeTasks = <String, Task>{};
  final queuedBatches = <List<String>>[];
  final excludedSnapshots = <Set<String>>[];
  final enqueueCompleter = <Completer<BackgroundBackupQueueResult>>[];
  int resumeCalls = 0;
  int cancelCalls = 0;
  int batchSize = 100;
  bool delayNextEnqueue = false;

  @override
  Future<List<Task>> getActiveTasks(String group) async {
    return activeTasks.values.where((task) => task.group == group).toList(growable: false);
  }

  @override
  Future<void> resume() async {
    resumeCalls++;
  }

  @override
  Future<int> cancel() async {
    cancelCalls++;
    activeTasks.clear();
    return 0;
  }

  @override
  Future<BackgroundBackupQueueResult> enqueueNextBackupBatch(
    String userId, {
    Set<String> excludedLocalAssetIds = const {},
  }) async {
    excludedSnapshots.add(Set<String>.from(excludedLocalAssetIds));
    if (delayNextEnqueue) {
      final completer = Completer<BackgroundBackupQueueResult>();
      enqueueCompleter.add(completer);
      return completer.future;
    }

    final eligibleIds = candidateIds.where((id) => !excludedLocalAssetIds.contains(id)).toList(growable: false);
    final ids = eligibleIds.take(batchSize).toList(growable: false);
    queuedBatches.add(ids);
    for (final id in ids) {
      activeTasks[id] = UploadTask(
        taskId: id,
        url: 'http://test-server.com/assets',
        filename: '$id.jpg',
        baseDirectory: BaseDirectory.temporary,
        group: kBackupGroup,
      );
    }

    return BackgroundBackupQueueResult(
      totalCandidateCount: candidateIds.length,
      eligibleCandidateCount: eligibleIds.length,
      enqueuedLocalAssetIds: ids,
      skippedLocalAssetIds: const [],
      enqueueFailedLocalAssetIds: const [],
      remainingEligibleCandidateCount: eligibleIds.length - ids.length,
    );
  }

  void completeDelayedEnqueue(BackgroundBackupQueueResult result) {
    enqueueCompleter.removeAt(0).complete(result);
  }
}

void main() {
  test('start resumes existing URLSession tasks instead of enqueueing duplicates', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-1']);
    queue.activeTasks['asset-1'] = UploadTask(
      taskId: 'asset-1',
      url: 'http://test-server.com/assets',
      filename: 'asset-1.jpg',
      baseDirectory: BaseDirectory.temporary,
      group: kBackupGroup,
    );
    final sut = BackgroundBackupQueueCoordinator(queue);

    await sut.start('user-1');

    expect(queue.resumeCalls, 1);
    expect(queue.queuedBatches, isEmpty);
  });

  test('full backup refills 3517 assets without UI calls and excludes completed ids until session ends', () async {
    final queue = FakeBackgroundUploadQueue(
      candidateIds: List.generate(3517, (index) => 'asset-$index'),
    );
    final sut = BackgroundBackupQueueCoordinator(queue);

    await sut.start('user-1');

    while (queue.activeTasks.isNotEmpty) {
      final task = queue.activeTasks.values.first;
      queue.activeTasks.remove(task.taskId);
      await sut.handleStatus(TaskStatusUpdate(task, TaskStatus.complete));
    }

    expect(queue.queuedBatches, hasLength(36));
    expect(queue.queuedBatches.take(35).every((batch) => batch.length == 100), true);
    expect(queue.queuedBatches.last, hasLength(17));
    expect(queue.queuedBatches.expand((batch) => batch).toSet(), hasLength(3517));
    expect(queue.excludedSnapshots.last, containsAll(List.generate(3517, (index) => 'asset-$index')));
  });

  test('concurrent terminal callbacks trigger at most one refill', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-0', 'asset-1', 'asset-2'])
      ..batchSize = 2;
    final sut = BackgroundBackupQueueCoordinator(queue);
    await sut.start('user-1');

    final first = queue.activeTasks.remove('asset-0')!;
    final second = queue.activeTasks.remove('asset-1')!;

    await Future.wait([
      sut.handleStatus(TaskStatusUpdate(first, TaskStatus.complete)),
      sut.handleStatus(TaskStatusUpdate(second, TaskStatus.complete)),
    ]);

    expect(queue.queuedBatches, [
      ['asset-0', 'asset-1'],
      ['asset-2'],
    ]);
  });

  test('stop during delayed enqueue prevents delayed results from keeping session active', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-0'])..delayNextEnqueue = true;
    final sut = BackgroundBackupQueueCoordinator(queue);

    final start = sut.start('user-1');
    await Future<void>.delayed(Duration.zero);
    await sut.stop();
    queue.completeDelayedEnqueue(
      const BackgroundBackupQueueResult(
        totalCandidateCount: 1,
        eligibleCandidateCount: 1,
        enqueuedLocalAssetIds: ['asset-0'],
        skippedLocalAssetIds: [],
        enqueueFailedLocalAssetIds: [],
        remainingEligibleCandidateCount: 0,
      ),
    );
    await start;

    expect(queue.cancelCalls, 1);
    expect(sut.isActive, false);
  });

  test('live photo motion completion does not refill until the still task completes', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-live', 'asset-next']);
    final sut = BackgroundBackupQueueCoordinator(queue);

    final motionTask = UploadTask(
      taskId: 'asset-live',
      url: 'http://test-server.com/assets',
      filename: 'asset-live.mov',
      baseDirectory: BaseDirectory.temporary,
      group: kBackupGroup,
      metaData: const UploadTaskMetadata(localAssetId: 'asset-live', isLivePhotos: true, livePhotoVideoId: '').toJson(),
    );
    final stillTask = UploadTask(
      taskId: 'asset-live',
      url: 'http://test-server.com/assets',
      filename: 'asset-live.heic',
      baseDirectory: BaseDirectory.temporary,
      group: kBackupLivePhotoGroup,
    );
    queue.activeTasks[motionTask.taskId] = motionTask;
    queue.activeTasks['asset-live-still'] = stillTask;

    await sut.start('user-1');
    queue.activeTasks.remove(motionTask.taskId);
    await sut.handleStatus(TaskStatusUpdate(motionTask, TaskStatus.complete));
    expect(queue.queuedBatches, isEmpty);

    queue.activeTasks.remove('asset-live-still');
    await sut.handleStatus(TaskStatusUpdate(stillTask, TaskStatus.complete));
    expect(queue.queuedBatches, hasLength(1));
  });

  test('failed uploads are excluded from immediate same-session retry', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-0', 'asset-1'])
      ..batchSize = 1;
    final sut = BackgroundBackupQueueCoordinator(queue);

    await sut.start('user-1');
    final failedTask = queue.activeTasks.remove('asset-0')!;
    await sut.handleStatus(TaskStatusUpdate(failedTask, TaskStatus.failed));

    expect(queue.queuedBatches, [
      ['asset-0'],
      ['asset-1'],
    ]);
    expect(queue.excludedSnapshots.last, contains('asset-0'));
  });

  test('skipped and enqueue-failed ids are excluded from the next refill', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-0', 'asset-1', 'asset-2']);
    final sut = BackgroundBackupQueueCoordinator(queue);

    queue.delayNextEnqueue = true;
    final start = sut.start('user-1');
    await Future<void>.delayed(Duration.zero);
    queue.delayNextEnqueue = false;
    queue.completeDelayedEnqueue(
      const BackgroundBackupQueueResult(
        totalCandidateCount: 3,
        eligibleCandidateCount: 3,
        enqueuedLocalAssetIds: ['asset-0'],
        skippedLocalAssetIds: ['asset-1'],
        enqueueFailedLocalAssetIds: ['asset-2'],
        remainingEligibleCandidateCount: 0,
      ),
    );
    await start;

    final task = queue.activeTasks.remove('asset-0')!;
    await sut.handleStatus(TaskStatusUpdate(task, TaskStatus.complete));

    expect(queue.excludedSnapshots.last, containsAll(['asset-0', 'asset-1', 'asset-2']));
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd mobile
mise exec -- flutter test test/services/background_backup_queue_coordinator_test.dart
```

Expected: FAIL because the coordinator and port do not exist.

- [ ] **Step 3: Implement coordinator and port**

Create `mobile/lib/services/background_backup_queue_coordinator.dart`:

```dart
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
```

Modify `mobile/lib/services/background_upload.service.dart`:

```dart
import 'package:immich_mobile/services/background_backup_queue_coordinator.dart';

class BackgroundUploadService implements BackgroundBackupQueuePort {
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd mobile
mise exec -- flutter test test/services/background_backup_queue_coordinator_test.dart test/services/background_upload.service_test.dart
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/services/background_backup_queue_coordinator.dart mobile/lib/services/background_upload.service.dart mobile/test/services/background_backup_queue_coordinator_test.dart
git commit -m "feat(mobile): coordinate full iOS background backup sessions"
```

---

### Task 3: Persist Large-Backup Progress From Coordinator State

**Files:**

- Modify: `mobile/lib/domain/models/background_backup_status.model.dart`
- Modify: `mobile/lib/services/background_backup_status.service.dart`
- Modify: `mobile/lib/services/background_backup_queue_coordinator.dart`
- Modify: `mobile/test/services/background_backup_status.service_test.dart`
- Modify: `mobile/test/domain/models/background_backup_status_model_test.dart`
- Modify: `mobile/test/services/background_backup_queue_coordinator_test.dart`

- [ ] **Step 1: Write failing status persistence tests**

Add to `mobile/test/services/background_backup_status.service_test.dart`:

```dart
test('recordQueueProgress keeps remaining count nonzero during large backup successes', () async {
  await sut.recordCandidateCount(3340);
  await sut.recordQueueProgress(
    queuedCount: 100,
    completedCount: 1,
    failedCount: 0,
    skippedCount: 0,
    enqueueFailedCount: 0,
    remainingCount: 3239,
  );

  final status = await sut.read();

  expect(status.lastQueuedCount, 100);
  expect(status.lastCompletedCount, 1);
  expect(status.lastFailedCount, 0);
  expect(status.lastSkippedCount, 0);
  expect(status.lastEnqueueFailedCount, 0);
  expect(status.lastRemainingCount, 3239);
  expect(status.lastCandidateCount, 3340);
});

test('recordBackupComplete clears pending counts only when no eligible candidates remain', () async {
  await sut.recordCandidateCount(17);
  await sut.recordQueueProgress(
    queuedCount: 17,
    completedCount: 17,
    failedCount: 0,
    skippedCount: 0,
    enqueueFailedCount: 0,
    remainingCount: 0,
  );
  await sut.recordBackupComplete();

  final status = await sut.read();

  expect(status.lastCandidateCount, 0);
  expect(status.lastRemainingCount, 0);
  expect(status.lastFullBackupCompletedAt, isNotNull);
});
```

Add to `mobile/test/domain/models/background_backup_status_model_test.dart`:

```dart
test('serializes large backup progress fields', () {
  final status = BackgroundBackupStatus(
    lastQueuedCount: 100,
    lastCompletedCount: 50,
    lastFailedCount: 2,
    lastSkippedCount: 3,
    lastEnqueueFailedCount: 4,
    lastRemainingCount: 3340,
    lastQueueDrainedAt: DateTime.utc(2026, 6, 2, 10),
    lastFullBackupCompletedAt: DateTime.utc(2026, 6, 2, 11),
  );

  final roundTrip = BackgroundBackupStatus.fromJson(status.toJson());

  expect(roundTrip.lastQueuedCount, 100);
  expect(roundTrip.lastCompletedCount, 50);
  expect(roundTrip.lastFailedCount, 2);
  expect(roundTrip.lastSkippedCount, 3);
  expect(roundTrip.lastEnqueueFailedCount, 4);
  expect(roundTrip.lastRemainingCount, 3340);
  expect(roundTrip.lastQueueDrainedAt, DateTime.utc(2026, 6, 2, 10));
  expect(roundTrip.lastFullBackupCompletedAt, DateTime.utc(2026, 6, 2, 11));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd mobile
mise exec -- flutter test test/services/background_backup_status.service_test.dart test/domain/models/background_backup_status_model_test.dart
```

Expected: FAIL because the new fields and methods do not exist.

- [ ] **Step 3: Add model fields**

Add to `BackgroundBackupStatus` in `mobile/lib/domain/models/background_backup_status.model.dart`:

```dart
final int lastQueuedCount;
final int lastCompletedCount;
final int lastFailedCount;
final int lastSkippedCount;
final int lastEnqueueFailedCount;
final int lastRemainingCount;
final DateTime? lastQueueDrainedAt;
final DateTime? lastFullBackupCompletedAt;
```

Add constructor defaults:

```dart
this.lastQueuedCount = 0,
this.lastCompletedCount = 0,
this.lastFailedCount = 0,
this.lastSkippedCount = 0,
this.lastEnqueueFailedCount = 0,
this.lastRemainingCount = 0,
this.lastQueueDrainedAt,
this.lastFullBackupCompletedAt,
```

Update `copyWith`, `toJson`, and `fromJson` using exact JSON keys:

```dart
'lastQueuedCount': lastQueuedCount,
'lastCompletedCount': lastCompletedCount,
'lastFailedCount': lastFailedCount,
'lastSkippedCount': lastSkippedCount,
'lastEnqueueFailedCount': lastEnqueueFailedCount,
'lastRemainingCount': lastRemainingCount,
'lastQueueDrainedAt': lastQueueDrainedAt?.toIso8601String(),
'lastFullBackupCompletedAt': lastFullBackupCompletedAt?.toIso8601String(),
```

- [ ] **Step 4: Add status service methods**

Add to `BackgroundBackupStatusService`:

```dart
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
      lastBackgroundFailureReason: failedCount > current.lastFailedCount
          ? BackgroundBackupFailureReason.uploadFailed
          : BackgroundBackupFailureReason.none,
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
      lastRemainingCount: 0,
      lastBackgroundFailureReason: BackgroundBackupFailureReason.none,
    ),
  );
}
```

- [ ] **Step 5: Move progress recording into the coordinator**

Extend `BackgroundBackupQueueCoordinator` constructor:

```dart
BackgroundBackupQueueCoordinator(this._queue, {BackgroundBackupStatusService? statusService})
  : _statusService = statusService;

final BackgroundBackupStatusService? _statusService;
```

Add counters:

```dart
int _remainingEligibleCount = 0;
```

In `_enqueueNextBatch()` after applying result sets:

```dart
_remainingEligibleCount = result.remainingEligibleCandidateCount;
await _recordProgress();
if (!result.queuedAny && !result.hasMoreEligibleCandidates) {
  await _statusService?.recordBackupComplete();
  _activeUserId = null;
}
```

In `_recordTerminalStatus()`, track whether the terminal update removed one logical asset from the active queue and decrement `_remainingEligibleCount` only for that case:

```dart
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
```

Add:

```dart
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
```

Remove `recordUploadSuccess()` and `recordFailure()` calls from `BackgroundUploadService._handleTaskStatusUpdate()` for backup groups. Keep file cleanup and Live Photo handling in `BackgroundUploadService`.

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
cd mobile
mise exec -- flutter test test/services/background_backup_status.service_test.dart test/domain/models/background_backup_status_model_test.dart test/services/background_backup_queue_coordinator_test.dart test/services/background_upload.service_test.dart
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/domain/models/background_backup_status.model.dart mobile/lib/services/background_backup_status.service.dart mobile/lib/services/background_backup_queue_coordinator.dart mobile/lib/services/background_upload.service.dart mobile/test/services/background_backup_status.service_test.dart mobile/test/domain/models/background_backup_status_model_test.dart mobile/test/services/background_backup_queue_coordinator_test.dart mobile/test/services/background_upload.service_test.dart
git commit -m "fix(mobile): persist full background backup progress"
```

---

### Task 4: Delegate iOS Provider Lifecycle To The Coordinator

**Files:**

- Modify: `mobile/lib/providers/backup/drift_backup.provider.dart`
- Create: `mobile/lib/providers/backup/background_backup_queue.provider.dart`
- Modify: `mobile/test/providers/backup/drift_backup_provider_test.dart`

- [ ] **Step 1: Write failing provider tests**

Add to `mobile/test/providers/backup/drift_backup_provider_test.dart`:

```dart
class MockBackgroundBackupQueueCoordinator extends Mock implements BackgroundBackupQueueCoordinator {}
```

Add setup:

```dart
late MockBackgroundBackupQueueCoordinator backgroundQueueCoordinator;

backgroundQueueCoordinator = MockBackgroundBackupQueueCoordinator();
sut = DriftBackupNotifier(
  foregroundUploadService,
  backgroundUploadService,
  UploadSpeedManager(),
  backgroundQueueCoordinator: backgroundQueueCoordinator,
);
```

Add tests:

```dart
test('starts iOS URLSession backup through queue coordinator', () async {
  debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  addTearDown(() => debugDefaultTargetPlatformOverride = null);

  when(() => backgroundQueueCoordinator.start('user-1')).thenAnswer((_) async {});

  await sut.startBackup('user-1');

  verify(() => backgroundQueueCoordinator.start('user-1')).called(1);
  verifyNever(() => backgroundUploadService.uploadBackupCandidates(any()));
});

test('background status callbacks can refill queue without calling getBackupStatus or details UI', () async {
  final task = UploadTask(
    taskId: 'asset-1',
    url: 'http://test-server.com/assets',
    filename: 'asset.jpg',
    baseDirectory: BaseDirectory.temporary,
    group: kBackupGroup,
  );
  when(() => backgroundQueueCoordinator.handleStatus(any())).thenAnswer((_) async {});

  statusController.add(TaskStatusUpdate(task, TaskStatus.complete));
  await pumpEventQueue();

  verifyNever(() => foregroundUploadService.getBackupCounts(any()));
  verify(() => backgroundQueueCoordinator.handleStatus(any(that: isA<TaskStatusUpdate>()))).called(1);
});

test('stops iOS URLSession backup through queue coordinator', () async {
  debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  addTearDown(() => debugDefaultTargetPlatformOverride = null);

  when(() => backgroundQueueCoordinator.stop()).thenAnswer((_) async {});

  await sut.stopBackup();

  verify(() => backgroundQueueCoordinator.stop()).called(1);
  verifyNever(() => backgroundUploadService.cancel());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd mobile
mise exec -- flutter test test/providers/backup/drift_backup_provider_test.dart
```

Expected: FAIL because `DriftBackupNotifier` does not accept/use the coordinator.

- [ ] **Step 3: Add coordinator provider and wire notifier**

Create `mobile/lib/providers/backup/background_backup_queue.provider.dart`:

```dart
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/services/background_backup_queue_coordinator.dart';
import 'package:immich_mobile/services/background_backup_status.service.dart';
import 'package:immich_mobile/services/background_upload.service.dart';

final backgroundBackupQueueCoordinatorProvider = Provider<BackgroundBackupQueueCoordinator>((ref) {
  return BackgroundBackupQueueCoordinator(
    ref.watch(backgroundUploadServiceProvider),
    statusService: ref.watch(backgroundBackupStatusServiceProvider),
  );
});
```

Modify `driftBackupProvider`:

```dart
final driftBackupProvider = StateNotifierProvider<DriftBackupNotifier, DriftBackupState>((ref) {
  return DriftBackupNotifier(
    ref.watch(foregroundUploadServiceProvider),
    ref.watch(backgroundUploadServiceProvider),
    UploadSpeedManager(),
    backgroundQueueCoordinator: ref.watch(backgroundBackupQueueCoordinatorProvider),
  );
});
```

Modify `DriftBackupNotifier` constructor:

```dart
DriftBackupNotifier(
  this._foregroundUploadService,
  this._backgroundUploadService,
  this._uploadSpeedManager, {
  BackgroundBackupQueueCoordinator? backgroundQueueCoordinator,
}) : _backgroundQueueCoordinator =
       backgroundQueueCoordinator ?? BackgroundBackupQueueCoordinator(_backgroundUploadService),
     super(...);

final BackgroundBackupQueueCoordinator _backgroundQueueCoordinator;
```

Modify iOS lifecycle:

```dart
Future<void> startBackupWithURLSession(String userId) {
  state = state.copyWith(error: BackupError.none);
  return _backgroundQueueCoordinator.start(userId);
}

Future<void> stopBackup() async {
  if (CurrentPlatform.isIOS) {
    await _backgroundQueueCoordinator.stop();
    _uploadSpeedManager.clear();
    state = state.copyWith(uploadItems: {}, iCloudDownloadProgress: {});
    return;
  }
  stopForegroundBackup();
}
```

Forward background statuses:

```dart
unawaited(_backgroundQueueCoordinator.handleStatus(update));
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd mobile
mise exec -- flutter test test/providers/backup/drift_backup_provider_test.dart test/services/background_backup_queue_coordinator_test.dart
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/providers/backup/drift_backup.provider.dart mobile/lib/providers/backup/background_backup_queue.provider.dart mobile/test/providers/backup/drift_backup_provider_test.dart
git commit -m "refactor(mobile): route iOS backup lifecycle through coordinator"
```

---

### Task 5: Preserve The TestFlight Crash Fix

**Files:**

- Modify: `mobile/test/infrastructure/repositories/draining_http_client_test.dart`
- Modify: `mobile/test/domain/services/background_worker_http_teardown_test.dart`
- Modify: `mobile/lib/infrastructure/repositories/draining_http_client.dart`

- [ ] **Step 1: Add teardown regression test**

Add to `mobile/test/infrastructure/repositories/draining_http_client_test.dart`:

```dart
test('shutdown waits for native completion after upload response is returned but body is never read', () async {
  final inner = _StreamingFakeClient(closeOnAbort: false);
  final client = DrainingHttpClient(inner);

  final response = await client.send(http.Request('POST', Uri.parse('http://test-server.com/assets')));
  expect(response.statusCode, 200);
  expect(inner.bodyWasListenedTo, true);

  final shutdown = client.closeAndDrain(timeout: const Duration(milliseconds: 200));
  await Future<void>.delayed(Duration.zero);

  expect(shutdown, doesNotComplete);

  inner.closeResponseBody();

  await shutdown;
  expect(inner.closed, true);
});
```

- [ ] **Step 2: Run tests to verify they pass or fail for the right reason**

Run:

```bash
cd mobile
mise exec -- flutter test test/infrastructure/repositories/draining_http_client_test.dart test/domain/services/background_worker_http_teardown_test.dart
```

Expected: PASS. A failure here blocks the queue work until `DrainingHttpClient` is fixed.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/infrastructure/repositories/draining_http_client.dart mobile/test/infrastructure/repositories/draining_http_client_test.dart mobile/test/domain/services/background_worker_http_teardown_test.dart
git commit -m "test(mobile): preserve background http teardown safety"
```

---

### Task 6: Add Noodle-Specific Device Log Verification

**Files:**

- Create: `mobile/tool/observe_ios_background_backup.sh`

- [ ] **Step 1: Create the script**

Create `mobile/tool/observe_ios_background_backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

UDID="${1:?usage: $0 <device-udid> [seconds]}"
SECONDS_TO_RUN="${2:-180}"

timeout "${SECONDS_TO_RUN}s" idevicesyslog -u "$UDID" -p "Noodle Gallery|nsurlsessiond" --no-colors \
  | rg -i "de\\.opennoodle\\.gallery|bundle id: de\\.opennoodle\\.gallery|Noodle Gallery\\(background_downloader\\)|for client de\\.opennoodle\\.gallery completed successfully|NDSession .* has [0-9]+ outstanding tasks|completed with error|abort|crash"
```

- [ ] **Step 2: Add expected-pattern comments**

Insert below `set -euo pipefail`:

```bash
# Healthy pattern:
# - "for client de.opennoodle.gallery completed successfully"
# - response batches continue after the first 100 assets
# - when "has 0 outstanding tasks" appears while the app still reports remaining
#   candidates, another Noodle batch appears without opening backup details
# - no Noodle "completed with error", abort, or crash lines
```

- [ ] **Step 3: Make executable and commit**

Run:

```bash
chmod +x mobile/tool/observe_ios_background_backup.sh
git add mobile/tool/observe_ios_background_backup.sh
git commit -m "chore(mobile): add iOS background backup log observer"
```

Expected: script is executable and committed.

---

### Task 7: Full Verification

**Files:**

- No code changes.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd mobile
mise exec -- flutter test \
  test/services/background_backup_queue_coordinator_test.dart \
  test/services/background_upload.service_test.dart \
  test/providers/backup/drift_backup_provider_test.dart \
  test/services/background_backup_status.service_test.dart \
  test/domain/models/background_backup_status_model_test.dart \
  test/infrastructure/repositories/draining_http_client_test.dart \
  test/domain/services/background_worker_http_teardown_test.dart
```

Expected: all tests pass.

- [ ] **Step 2: Run static analysis**

Run:

```bash
cd mobile
mise exec -- dart analyze --fatal-infos \
  lib/services/background_backup_queue_coordinator.dart \
  lib/services/background_upload.service.dart \
  lib/providers/backup/drift_backup.provider.dart \
  lib/providers/backup/background_backup_queue.provider.dart \
  lib/services/background_backup_status.service.dart \
  lib/domain/models/background_backup_status.model.dart \
  test/services/background_backup_queue_coordinator_test.dart \
  test/services/background_upload.service_test.dart \
  test/providers/backup/drift_backup_provider_test.dart
```

Expected: `No issues found!`

- [ ] **Step 3: Run full mobile tests**

Run:

```bash
cd mobile
mise exec -- flutter test
```

Expected: all tests pass. Existing localization warnings are acceptable only with exit code zero.

- [ ] **Step 4: Build, install, and launch on the plugged-in iPhone**

Run:

```bash
cd mobile
mise exec -- flutter build ios --release -d 00008150-00025C513CD0C01C --build-name 4.56.8 --build-number 276
xcrun devicectl device install app --device 00008150-00025C513CD0C01C "build/ios/iphoneos/Noodle Gallery.app"
xcrun devicectl device process launch --device 00008150-00025C513CD0C01C de.opennoodle.gallery
```

Expected: build succeeds, install succeeds, launch succeeds.

- [ ] **Step 5: Observe a real full backup**

Run:

```bash
cd mobile
./tool/observe_ios_background_backup.sh 00008150-00025C513CD0C01C 300
```

Expected:

- Noodle uploads continue beyond the first 100 tasks.
- When native outstanding tasks reaches `0` while the app still has remaining candidates, another Noodle batch appears without opening backup details.
- Noodle task completions are successful.
- No Noodle `completed with error`, abort, crash, or Dart FFI callback assertion appears.

Record command outputs and device-log observations in the PR body. Do not commit generated branding overlay files.

---

## Coverage Matrix

| Requirement / Edge Case                                                    | Covered By                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Full backup with 3,517 assets                                              | Task 2 full-backup test                                     |
| Completed assets remain excluded until session end despite remote-sync lag | Task 2 full-backup test                                     |
| Refill does not depend on details page / UI count refresh                  | Task 4 provider no-UI test                                  |
| Native queue drains repeatedly and refills                                 | Task 2 full-backup test                                     |
| Active URLSession tasks resume after restart                               | Task 2 start/resume test                                    |
| Concurrent terminal callbacks enqueue one next batch                       | Task 2 concurrent callback test                             |
| Stop/cancel during in-flight enqueue                                       | Task 2 delayed enqueue cancellation test                    |
| Failed uploads are not immediately requeued                                | Task 2 failed upload test                                   |
| Skipped missing-file/entity assets are not looped                          | Task 1 mixed skip test and Task 2 skipped exclusion test    |
| Mixed native `enqueueAll` results are handled                              | Task 1 mixed enqueue failure test and Task 2 exclusion test |
| Empty eligible batch exits cleanly                                         | Task 1 all-excluded test                                    |
| Live Photo motion/still semantics                                          | Task 2 Live Photo test                                      |
| Persisted status remains pending during large backups                      | Task 3 status tests                                         |
| TestFlight HTTP teardown crash remains fixed                               | Task 5 teardown tests                                       |
| Device-level verification is Noodle-specific                               | Task 6 script and Task 7 device observation                 |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-02-ios-full-backup-tdd.md`.

Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.
