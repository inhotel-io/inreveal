import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/camera_picker_make_accordion.widget.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/cascade_picker.dart';

@RoutePage()
class CameraPickerPage extends StatelessWidget {
  const CameraPickerPage({super.key});

  @override
  Widget build(BuildContext context) => CascadePickerScaffold(config: cameraCascadeConfig);
}
