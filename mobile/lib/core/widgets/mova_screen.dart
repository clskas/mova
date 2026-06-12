import 'package:flutter/material.dart';

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
    return Scaffold(
      appBar: (title != null || titleWidget != null)
          ? AppBar(title: titleWidget ?? Text(title!), actions: actions)
          : null,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomNavigationBar,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            if (!scrollable) {
              return Padding(padding: padding, child: child);
            }
            return SingleChildScrollView(
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
