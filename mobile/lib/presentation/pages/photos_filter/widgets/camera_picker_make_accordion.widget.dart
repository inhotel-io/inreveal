import 'package:flutter/material.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/cascade_picker.dart';
import 'package:immich_mobile/providers/photos_filter/camera_model_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/camera_picker.provider.dart';

/// make → model cascade config for [CameraPickerPage] — see
/// [CascadePickerConfig] for what each field drives.
final cameraCascadeConfig = CascadePickerConfig(
  keyPrefix: 'camera-picker',
  parentKeyPart: 'make',
  childKeyPart: 'model',
  titleKey: 'filter_sheet_picker_camera_title',
  hintKey: 'filter_sheet_picker_search_camera_hint',
  queryProvider: cameraPickerQueryProvider,
  parentsProvider: cameraPickerMakesProvider,
  childrenProvider: cameraModelSuggestionsProvider,
  selectedParent: (f) => f.camera.make,
  selectedChild: (f) => f.camera.model,
  selectParent: (notifier, make) => notifier.setCamera(SearchCameraFilter(make: make)),
  selectChild: (notifier, make, model) => notifier.setCamera(SearchCameraFilter(make: make, model: model)),
  accordionBuilder: (expanded, onExpand) => CameraPickerMakeAccordion(expandedMake: expanded, onExpandMake: onExpand),
);

/// Full-screen make → model accordion for [CameraPickerPage]. Behaviour lives
/// in [CascadeAccordion]; this is the Camera-flavoured binding of it.
class CameraPickerMakeAccordion extends StatelessWidget {
  final String? expandedMake;
  final ValueChanged<String?> onExpandMake;

  const CameraPickerMakeAccordion({super.key, required this.expandedMake, required this.onExpandMake});

  @override
  Widget build(BuildContext context) =>
      CascadeAccordion(config: cameraCascadeConfig, expanded: expandedMake, onExpand: onExpandMake);
}
