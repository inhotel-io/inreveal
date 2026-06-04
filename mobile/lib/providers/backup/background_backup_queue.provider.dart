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
