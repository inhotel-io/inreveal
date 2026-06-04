import 'dart:async';

import 'package:background_downloader/background_downloader.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/constants/constants.dart';
import 'package:immich_mobile/services/background_backup_queue_coordinator.dart';
import 'package:immich_mobile/services/background_backup_status.service.dart';
import 'package:immich_mobile/services/background_upload.service.dart';
import 'package:mocktail/mocktail.dart';

class MockBackgroundBackupStatusService extends Mock implements BackgroundBackupStatusService {}

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
  bool throwOnEnqueue = false;
  final scriptedResults = <BackgroundBackupQueueResult>[];

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
    if (throwOnEnqueue) {
      throw StateError('enqueue failed');
    }
    if (scriptedResults.isNotEmpty) {
      final result = scriptedResults.removeAt(0);
      if (result.enqueuedLocalAssetIds.isNotEmpty) {
        queuedBatches.add(result.enqueuedLocalAssetIds);
        for (final id in result.enqueuedLocalAssetIds) {
          activeTasks[id] = UploadTask(
            taskId: id,
            url: 'http://test-server.com/assets',
            filename: '$id.jpg',
            baseDirectory: BaseDirectory.temporary,
            group: kBackupGroup,
          );
        }
      }
      return result;
    }
    if (delayNextEnqueue) {
      final completer = Completer<BackgroundBackupQueueResult>();
      enqueueCompleter.add(completer);
      return completer.future;
    }

    final eligibleIds = candidateIds.where((id) => !excludedLocalAssetIds.contains(id)).toList(growable: false);
    final ids = eligibleIds.take(batchSize).toList(growable: false);
    if (ids.isNotEmpty) queuedBatches.add(ids);
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
    for (final id in result.enqueuedLocalAssetIds) {
      activeTasks[id] = UploadTask(
        taskId: id,
        url: 'http://test-server.com/assets',
        filename: '$id.jpg',
        baseDirectory: BaseDirectory.temporary,
        group: kBackupGroup,
      );
    }
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
    expect(sut.isActive, false);
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

  test('ends the session instead of stalling when enqueue throws on start', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-0'])..throwOnEnqueue = true;
    final sut = BackgroundBackupQueueCoordinator(queue);

    await sut.start('user-1');

    expect(sut.isActive, false);
    expect(queue.queuedBatches, isEmpty);
  });

  test('a refill error ends the session without poisoning the status chain', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-0', 'asset-1'])..batchSize = 1;
    final sut = BackgroundBackupQueueCoordinator(queue);

    await sut.start('user-1');
    final task = queue.activeTasks.remove('asset-0')!;
    queue.throwOnEnqueue = true;

    await sut.handleStatus(TaskStatusUpdate(task, TaskStatus.complete));

    expect(sut.isActive, false);
  });

  test('advances past a fully skipped batch without waiting for callbacks', () async {
    final queue = FakeBackgroundUploadQueue();
    queue.scriptedResults.addAll([
      const BackgroundBackupQueueResult(
        totalCandidateCount: 150,
        eligibleCandidateCount: 150,
        enqueuedLocalAssetIds: [],
        skippedLocalAssetIds: ['s0'],
        enqueueFailedLocalAssetIds: [],
        remainingEligibleCandidateCount: 50,
      ),
      const BackgroundBackupQueueResult(
        totalCandidateCount: 150,
        eligibleCandidateCount: 50,
        enqueuedLocalAssetIds: ['asset-real'],
        skippedLocalAssetIds: [],
        enqueueFailedLocalAssetIds: [],
        remainingEligibleCandidateCount: 49,
      ),
    ]);
    final sut = BackgroundBackupQueueCoordinator(queue);

    await sut.start('user-1');

    expect(queue.queuedBatches, [
      ['asset-real'],
    ]);
    expect(queue.excludedSnapshots.length, 2);
    expect(sut.isActive, true);
  });

  test('start with an empty library ends the session immediately', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: []);
    final sut = BackgroundBackupQueueCoordinator(queue);

    await sut.start('user-1');

    expect(queue.queuedBatches, isEmpty);
    expect(sut.isActive, false);
  });

  test('records a session start and persists progress on each completion and drain', () async {
    final status = MockBackgroundBackupStatusService();
    when(() => status.recordSessionStart()).thenAnswer((_) async {});
    when(
      () => status.recordQueueProgress(
        queuedCount: any(named: 'queuedCount'),
        completedCount: any(named: 'completedCount'),
        failedCount: any(named: 'failedCount'),
        skippedCount: any(named: 'skippedCount'),
        enqueueFailedCount: any(named: 'enqueueFailedCount'),
        remainingCount: any(named: 'remainingCount'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => status.recordQueueDrained(remainingCount: any(named: 'remainingCount')),
    ).thenAnswer((_) async {});
    when(() => status.recordBackupComplete()).thenAnswer((_) async {});

    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-0', 'asset-1'])..batchSize = 1;
    final sut = BackgroundBackupQueueCoordinator(queue, statusService: status);

    await sut.start('user-1'); // enqueues asset-0
    final task = queue.activeTasks.remove('asset-0')!;
    await sut.handleStatus(TaskStatusUpdate(task, TaskStatus.complete)); // drains → records drained → refill asset-1

    verify(() => status.recordSessionStart()).called(1);
    verify(
      () => status.recordQueueDrained(remainingCount: any(named: 'remainingCount')),
    ).called(greaterThanOrEqualTo(1));
    verify(
      () => status.recordQueueProgress(
        queuedCount: any(named: 'queuedCount'),
        completedCount: any(named: 'completedCount'),
        failedCount: any(named: 'failedCount'),
        skippedCount: any(named: 'skippedCount'),
        enqueueFailedCount: any(named: 'enqueueFailedCount'),
        remainingCount: any(named: 'remainingCount'),
      ),
    ).called(greaterThanOrEqualTo(2)); // at least: after enqueue + after the completion
  });

  test('clears prior-session counts on a fresh start', () async {
    final queue = FakeBackgroundUploadQueue(candidateIds: ['asset-0']);
    final sut = BackgroundBackupQueueCoordinator(queue);
    await sut.start('user-1');
    final task = queue.activeTasks.remove('asset-0')!;
    await sut.handleStatus(TaskStatusUpdate(task, TaskStatus.complete)); // session completes; sets retain asset-0

    // New session: sets must be cleared so excludedSnapshots don't carry asset-0 from before.
    queue.candidateIds.add('asset-1');
    queue.excludedSnapshots.clear();
    await sut.start('user-1');
    expect(queue.excludedSnapshots.first, isNot(contains('asset-0')));
  });
}
