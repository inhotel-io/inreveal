import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/strips/value_strip.widget.dart';
import 'package:immich_mobile/routing/router.dart';

class CameraStrip extends ConsumerWidget {
  const CameraStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ValueStrip(
      titleKey: 'filter_sheet_camera',
      tileKeyName: 'camera-tile',
      moreKeyName: 'camera-strip-more',
      pickerRoute: const CameraPickerRoute(),
      itemsSelector: (s) => s.cameraMakes,
      isSelected: (f, make) => f.camera.make == make,
      onToggle: (notifier, make, isSelected) => notifier.setCamera(isSelected ? null : SearchCameraFilter(make: make)),
    );
  }
}
