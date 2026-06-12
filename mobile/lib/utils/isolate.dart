import 'dart:async';
import 'dart:ui';

import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/services/log.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/network.repository.dart';
import 'package:immich_mobile/providers/infrastructure/cancel.provider.dart';
import 'package:immich_mobile/providers/infrastructure/db.provider.dart';
import 'package:immich_mobile/utils/bootstrap.dart';
import 'package:immich_mobile/utils/debug_print.dart';
import 'package:immich_mobile/wm_executor.dart';
import 'package:logging/logging.dart';
import 'package:worker_manager/worker_manager.dart';

class InvalidIsolateUsageException implements Exception {
  const InvalidIsolateUsageException();

  @override
  String toString() => "IsolateHelper should only be used from the root isolate";
}

// !! Should be used only from the root isolate
Cancelable<T?> runInIsolateGentle<T>({
  required Future<T> Function(ProviderContainer ref) computation,
  String? debugLabel,
}) {
  final token = RootIsolateToken.instance;
  if (token == null) {
    throw const InvalidIsolateUsageException();
  }

  return workerManagerPatch.executeGentle((cancelledChecker) async {
    T? result;
    await runZonedGuarded(
      () async {
        BackgroundIsolateBinaryMessenger.ensureInitialized(token);
        DartPluginRegistrant.ensureInitialized();

        // iOS shares one native URLSession across isolates via cupertino_http.
        // If this isolate is torn down while a request is in flight, the
        // request's delegate later fires into the now-dead isolate and aborts
        // the process (SIGABRT in a Dart FFI callback). Track in-flight requests
        // so they can be drained before teardown. Must run before initDomain
        // (which calls NetworkRepository.init). See [DrainingHttpClient].
        NetworkRepository.enableShutdownTracking();

        final (drift, logDb) = await Bootstrap.initDomain(shouldBufferLogs: false, listenStoreUpdates: false);
        final ref = ProviderContainer(
          overrides: [
            cancellationProvider.overrideWithValue(cancelledChecker),
            driftProvider.overrideWith(driftOverride(drift)),
          ],
        );

        Logger log = Logger("IsolateLogger");

        try {
          result = await computation(ref);
        } on CanceledError {
          log.warning("Computation cancelled ${debugLabel == null ? '' : ' for $debugLabel'}");
        } catch (error, stack) {
          log.severe("Error in runInIsolateGentle ${debugLabel == null ? '' : ' for $debugLabel'}", error, stack);
        } finally {
          try {
            // Abort and drain in-flight HTTP requests while this isolate is
            // still alive, so no cupertino_http delegate can call back into it
            // after teardown. No-op unless shutdown tracking was enabled above.
            await NetworkRepository.shutdown();

            ref.dispose();

            await Store.dispose();
            await LogService.I.dispose();
            await logDb.close();
            await drift.close();
          } catch (error, stack) {
            dPrint(() => "Error closing resources in isolate: $error, $stack");
          } finally {
            ref.dispose();
            // Delay to ensure all resources are released
            await Future.delayed(const Duration(seconds: 2));
          }
        }
      },
      (error, stack) {
        dPrint(() => "Error in isolate $debugLabel zone: $error, $stack");
      },
    );
    return result;
  });
}
