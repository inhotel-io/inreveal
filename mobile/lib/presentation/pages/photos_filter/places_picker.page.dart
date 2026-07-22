import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/cascade_picker.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/places_picker_country_accordion.widget.dart';

@RoutePage()
class PlacesPickerPage extends StatelessWidget {
  const PlacesPickerPage({super.key});

  @override
  Widget build(BuildContext context) => CascadePickerScaffold(config: placesCascadeConfig);
}
