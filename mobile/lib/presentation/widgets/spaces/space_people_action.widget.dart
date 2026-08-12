import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:openapi/api.dart';

/// App-bar entry point to a space's own People page.
///
/// Extracted from [SpaceDetailPage] for the same reason as [SpaceDetailKebab]: that page loads
/// network metadata, members and a Drift timeline, so it cannot be pumped in a widget test.
/// This widget owns the whole visibility rule, which makes the rule testable on its own.
///
/// `faceRecognitionEnabled` is `Optional<bool?>` and `Absent.value` THROWS, so it is read via
/// `orElse(null)`. An explicit `false` hides the action, mirroring the web SpaceTabs. An absent
/// flag shows it: absent only happens against a server that omits the field, and the server
/// returns an empty list for a face-recognition-disabled space, so the worst case is a correct
/// empty state rather than a silently missing feature.
class SpacePeopleAction extends StatelessWidget {
  const SpacePeopleAction({super.key, required this.space, required this.onTap});

  final SharedSpaceResponseDto space;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = space.faceRecognitionEnabled.orElse(null) ?? true;
    if (!enabled) {
      return const SizedBox.shrink();
    }

    return IconButton(
      key: const Key('space-people-action'),
      icon: const Icon(Icons.face_outlined),
      onPressed: onTap,
      tooltip: 'people'.tr(),
    );
  }
}
