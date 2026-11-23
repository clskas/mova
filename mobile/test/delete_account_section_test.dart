import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mova/features/profile/delete_account_section.dart';

void main() {
  testWidgets('« Supprimer mon compte » asks twice before deleting', (tester) async {
    await tester.pumpWidget(const ProviderScope(
      child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: DeleteAccountSection()))),
    ));
    await tester.tap(find.byKey(const Key('delete-account')));
    await tester.pumpAndSettle();
    expect(find.text('Supprimer mon compte ?'), findsOneWidget);
    await tester.tap(find.text('Continuer'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmer la suppression'), findsOneWidget);
    expect(find.text('Supprimer définitivement'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    await tester.pumpAndSettle();
    expect(find.text('Compte supprimé'), findsNothing);
  });
}
