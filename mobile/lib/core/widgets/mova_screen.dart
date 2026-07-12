import 'package:flutter/material.dart';

import 'mova_layout.dart';

/// Scroll fluide utilisé sur tous les écrans MOVA.
const ScrollPhysics kMovaScrollPhysics = BouncingScrollPhysics(
  parent: AlwaysScrollableScrollPhysics(),
);

/// Anti-overflow screen wrapper — mandatory pattern for all MOVA screens
class MovaScreen extends StatelessWidget {
  const MovaScreen({
    super.key,
    this.title,
    this.titleWidget,
    this.actions,
    this.floatingActionButton,
    this.bottomNavigationBar,
    required this.child,
    this.scrollable = true,
    this.padding = const EdgeInsets.all(16),
    this.centerContent = false,
  });

  final String? title;
  final Widget? titleWidget;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final Widget? bottomNavigationBar;
  final Widget child;
  final bool scrollable;
  final EdgeInsets padding;
  /// Centre verticalement le contenu (écrans de connexion OTP).
  final bool centerContent;

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.viewInsetsOf(context);

    Widget bodyChild = Padding(padding: padding, child: child);

    if (centerContent) {
      bodyChild = Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: bodyChild,
        ),
      );
    }

    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: (title != null || titleWidget != null)
          ? AppBar(
              title: titleWidget ??
                  (title != null
                      ? Text(
                          title!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        )
                      : null),
              actions: actions,
            )
          : null,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomNavigationBar,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            if (!scrollable) {
              return SizedBox(
                height: constraints.maxHeight,
                width: constraints.maxWidth,
                child: bodyChild,
              );
            }
            return SingleChildScrollView(
              physics: kMovaScrollPhysics,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: EdgeInsets.only(bottom: viewInsets.bottom),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: centerContent
                    ? Align(alignment: Alignment.center, child: bodyChild)
                    : bodyChild,
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Carte en haut + formulaire scrollable (Taxi, livraisons, etc.).
class MovaMapFormLayout extends StatelessWidget {
  const MovaMapFormLayout({
    super.key,
    required this.mapBuilder,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.mapFraction = 0.30,
    this.minMapHeight = 120,
    this.maxMapHeight = 200,
  });

  final Widget Function(double height) mapBuilder;
  final Widget child;
  final EdgeInsets padding;
  final double mapFraction;
  final double minMapHeight;
  final double maxMapHeight;

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.viewInsetsOf(context);
    final keyboardOpen = viewInsets.bottom > 0;
    final compact = MovaLayout.isCompact(context);
    final veryCompact = MovaLayout.isVeryCompact(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        final effectiveMin = veryCompact ? 64.0 : (compact ? 80.0 : minMapHeight);
        final effectiveMax = veryCompact ? 96.0 : (compact ? 132.0 : maxMapHeight);
        final fraction = compact ? 0.18 : mapFraction;

        final mapHeight = keyboardOpen
            ? (veryCompact ? 0.0 : (compact ? 64.0 : minMapHeight))
            : (constraints.maxHeight * fraction).clamp(effectiveMin, effectiveMax);

        final effectivePadding = MovaLayout.formPadding(context, normal: padding);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (mapHeight > 0) mapBuilder(mapHeight),
            Expanded(
              child: SingleChildScrollView(
                physics: kMovaScrollPhysics,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: effectivePadding.copyWith(bottom: effectivePadding.bottom + viewInsets.bottom),
                child: child,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Corps scrollable dans un écran `scrollable: false` (ex. onglets, split view).
class MovaFlexScroll extends StatelessWidget {
  const MovaFlexScroll({
    super.key,
    required this.child,
    this.padding,
    this.controller,
  });

  final Widget child;
  final EdgeInsets? padding;
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.viewInsetsOf(context);
    return SingleChildScrollView(
      controller: controller,
      physics: kMovaScrollPhysics,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: (padding ?? EdgeInsets.zero).copyWith(
        bottom: (padding?.bottom ?? 0) + viewInsets.bottom,
      ),
      child: child,
    );
  }
}
