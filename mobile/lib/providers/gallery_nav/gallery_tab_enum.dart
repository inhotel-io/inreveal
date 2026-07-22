/// Fork-only tab identity. Distinct from upstream's `TabEnum`
/// (`home/search/spaces/library`) — the bottom nav redesign keeps the
/// upstream enum + constants untouched for rebase hygiene (design §4.6, §6.6).
///
/// The declaration order IS the bottom-nav tab order: `.index` is what
/// `tabsRouter.setActiveIndex` is driven with.
enum GalleryTabEnum { photos, albums, library }
