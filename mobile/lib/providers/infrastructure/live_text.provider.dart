import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/services/live_text.service.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';

final liveTextHostApiProvider = Provider<LiveTextHostApi>((ref) => LiveTextHostApi());

final liveTextServiceProvider = Provider<LiveTextService>((ref) => LiveTextService(ref.watch(liveTextHostApiProvider)));

final liveTextSupportedProvider = FutureProvider<bool>((ref) => ref.watch(liveTextServiceProvider).isSupported());
