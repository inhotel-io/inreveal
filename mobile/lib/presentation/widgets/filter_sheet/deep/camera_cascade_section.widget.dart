import 'package:flutter/material.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/deep/cascade_section.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';
import 'package:immich_mobile/providers/photos_filter/camera_model_suggestions.provider.dart';

/// CameraCascadeSection — Deep-snap section for the Camera filter dimension
/// (make → model). Behaviour lives in [CascadeSection]; this is the
/// Camera-flavoured binding of it.
class CameraCascadeSection extends StatelessWidget {
  final VoidCallback? onOpenPicker;
  const CameraCascadeSection({super.key, this.onOpenPicker});

  @override
  Widget build(BuildContext context) {
    return CascadeSection(
      sectionId: FilterSectionId.camera,
      titleKey: 'filter_sheet_deep_camera_section',
      keyPrefix: 'camera',
      parentKeyPart: 'make',
      childKeyPart: 'model',
      searchMoreI18nKey: 'filter_sheet_deep_search_n_cameras',
      searchMoreKeyName: 'camera-section-search-more',
      itemsSelector: (s) => s.cameraMakes,
      childrenProvider: cameraModelSuggestionsProvider,
      selectedParent: (f) => f.camera.make,
      selectedChild: (f) => f.camera.model,
      setParent: (notifier, make) => notifier.setCamera(make == null ? null : SearchCameraFilter(make: make)),
      setChild: (notifier, make, model) => notifier.setCamera(SearchCameraFilter(make: make, model: model)),
      onOpenPicker: onOpenPicker,
    );
  }
}
