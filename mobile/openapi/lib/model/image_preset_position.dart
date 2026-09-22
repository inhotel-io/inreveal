//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

/// Crop position for derived image presets
enum ImagePresetPosition {
  center._(r'center'),
  attention._(r'attention'),
  entropy._(r'entropy'),
  ;

  /// Instantiate a new enum with the provided value.
  const ImagePresetPosition._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [ImagePresetPosition] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static ImagePresetPosition? fromJson(dynamic value) => ImagePresetPositionTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [ImagePresetPosition]
  /// that were successfully decoded from the passed [JSON][json].
  static List<ImagePresetPosition> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ImagePresetPosition>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ImagePresetPosition.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ImagePresetPosition] to String,
/// and [decode] dynamic data back to [ImagePresetPosition].
class ImagePresetPositionTypeTransformer {
  factory ImagePresetPositionTypeTransformer() => _instance ??= const ImagePresetPositionTypeTransformer._();

  const ImagePresetPositionTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(ImagePresetPosition data) => data._value;

  /// Returns the instance of [ImagePresetPosition] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ImagePresetPosition? decode(dynamic data, {bool allowNull = true}) {
    if (data is ImagePresetPosition) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'center': return ImagePresetPosition.center;
        case r'attention': return ImagePresetPosition.attention;
        case r'entropy': return ImagePresetPosition.entropy;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static ImagePresetPositionTypeTransformer? _instance;
}

