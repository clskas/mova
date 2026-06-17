import 'package:flutter/material.dart';

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
  });

  final String? title;
  final Widget? titleWidget;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final Widget? bottomNavigationBar;
  final Widget child;
  final bool scrollable;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.viewInsetsOf(context);

    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: (title != null || titleWidget != null)
          ? AppBar(title: titleWidget ?? Text(title!), actions: actions)
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
                child: Padding(padding: padding, child: child),
              );
            }
            return SingleChildScrollView(
              physics: kMovaScrollPhysics,
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: EdgeInsets.only(bottom: viewInsets.bottom),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Padding(padding: padding, child: child),
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

    return LayoutBuilder(
      builder: (context, constraints) {
        final mapHeight = keyboardOpen
            ? minMapHeight
            : (constraints.maxHeight * mapFraction).clamp(minMapHeight, maxMapHeight);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            mapBuilder(mapHeight),
            Expanded(
              child: SingleChildScrollView(
                physics: kMovaScrollPhysics,
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: padding.copyWith(bottom: padding.bottom + viewInsets.bottom),
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
