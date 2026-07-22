import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/presentation/widgets/gallery_nav/gallery_bottom_nav.widget.dart';
import 'package:immich_mobile/routing/router.dart';

/// Bottom-nav shell. `tabsRouter.activeIndex` is the single source of truth for
/// the active tab; invalidations and ScrollToTopEvent live in
/// `GalleryBottomNav._onTabTap` because they also need to fire on same-tab
/// re-taps.
@RoutePage()
class GalleryTabShellPage extends StatelessWidget {
  const GalleryTabShellPage({super.key});

  @override
  Widget build(BuildContext context) {
    final isLandscape = context.orientation == Orientation.landscape;
    return AutoTabsRouter(
      routes: const [MainTimelineRoute(), DriftAlbumsRoute(), DriftLibraryRoute()],
      duration: const Duration(milliseconds: 600),
      transitionBuilder: (_, child, animation) => FadeTransition(opacity: animation, child: child),
      builder: (context, child) {
        final tabsRouter = AutoTabsRouter.of(context);
        return PopScope(
          canPop: tabsRouter.activeIndex == 0,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) tabsRouter.setActiveIndex(0);
          },
          child: Scaffold(
            resizeToAvoidBottomInset: false,
            extendBody: true,
            body: isLandscape
                ? Row(
                    children: [
                      GalleryBottomNav(tabsRouter: tabsRouter),
                      const VerticalDivider(),
                      Expanded(child: child),
                    ],
                  )
                : child,
            bottomNavigationBar: isLandscape ? null : GalleryBottomNav(tabsRouter: tabsRouter),
          ),
        );
      },
    );
  }
}
