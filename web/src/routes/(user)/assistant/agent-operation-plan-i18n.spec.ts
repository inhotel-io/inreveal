import en from '$i18n/en.json';

describe('agent operation plan i18n', () => {
  it('defines the apply action English strings used by the review panel', () => {
    expect(en).toEqual(
      expect.objectContaining({
        assistant_operation_apply_applying: 'Applying operations',
        assistant_operation_apply_error: 'Unable to apply proposed operations',
        assistant_operation_apply_selected: 'Apply {count, plural, one {# selected} other {# selected}}',
        assistant_operation_apply_success:
          'Applied {applied, plural, one {# operation} other {{applied, number} operations}}. {failed, plural, one {# failed} other {{failed, number} failed}}.',
      }),
    );
  });

  it('defines the expanded item review English strings', () => {
    expect(en).toEqual(
      expect.objectContaining({
        assistant_operation_item_filter_label: 'Filter photos',
        assistant_operation_item_filter_placeholder: 'Filter photos',
        assistant_operation_item_media_all: 'All',
        assistant_operation_item_media_photos: 'Photos',
        assistant_operation_item_media_videos: 'Videos',
        assistant_operation_item_quick_screenshots: 'Screenshots',
        assistant_operation_item_quick_duplicates: 'Duplicates',
        assistant_operation_item_exclude_videos: 'Exclude videos',
        assistant_operation_item_include_only_videos: 'Include only videos',
        assistant_operation_item_exclude_visible: 'Exclude visible',
        assistant_operation_item_include_visible: 'Include visible',
        assistant_operation_item_select_all_filtered: 'Select all filtered',
        assistant_operation_item_deselect_all_filtered: 'Deselect all filtered',
        assistant_operation_item_virtual_summary:
          'Showing {visible, number} of {total, number} {total, plural, one {photo} other {photos}}',
      }),
    );
  });

  it('defines partial apply and technical detail English strings', () => {
    expect(en).toEqual(
      expect.objectContaining({
        assistant_operation_status_partial: 'Partially applied',
        assistant_operation_skipped_reason: 'Skipped: {reason}',
        assistant_operation_partial_asset_summary:
          '{applied, plural, one {# applied} other {{applied, number} applied}} · {failed, plural, one {# failed} other {{failed, number} failed}}',
        assistant_operation_detail_show: 'Show technical details',
        assistant_operation_detail_hide: 'Hide technical details',
        assistant_operation_detail_assets_preview: 'Asset IDs',
        assistant_operation_detail_assets_overflow:
          '{count, plural, one {# more asset ID} other {{count, number} more asset IDs}}',
        assistant_operation_apply_partial_summary:
          '{applied, plural, one {# applied} other {{applied, number} applied}} · {skipped, plural, one {# skipped} other {{skipped, number} skipped}} · {failed, plural, one {# failed} other {{failed, number} failed}}. Review details before continuing.',
      }),
    );
  });
});
