sealed class ChipId {
  const ChipId();
}

class PersonChipId extends ChipId {
  final String personId;
  const PersonChipId(this.personId);
  @override
  bool operator ==(Object other) => other is PersonChipId && other.personId == personId;
  @override
  int get hashCode => Object.hash('PersonChipId', personId);
}

class TagChipId extends ChipId {
  final String tagId;
  const TagChipId(this.tagId);
  @override
  bool operator ==(Object other) => other is TagChipId && other.tagId == tagId;
  @override
  int get hashCode => Object.hash('TagChipId', tagId);
}

/// Value-less chip ids — one identity per filter dimension, so a chip can be
/// removed by identity alone. An enum gives structural `==`/`hashCode` for free.
enum SimpleChipId implements ChipId {
  location,
  camera,
  date,
  rating,
  mediaType,
  favourite,
  archive,
  notInAlbum,
  untagged,
  text,
}
