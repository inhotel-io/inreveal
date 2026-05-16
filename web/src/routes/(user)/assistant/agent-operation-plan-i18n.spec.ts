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
});
