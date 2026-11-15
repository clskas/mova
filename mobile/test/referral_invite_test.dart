import 'package:flutter_test/flutter_test.dart';
import 'package:mova/core/referral/referral_invite.dart';

void main() {
  test('normalises a typed or pasted code', () {
    expect(ReferralInvite.normalize(' sgab-12 cd '), 'SGAB12CD');
    expect(ReferralInvite.normalize('ab'), isNull);
    expect(ReferralInvite.normalize(null), isNull);
  });

  test('reads the code from the Play install referrer', () {
    expect(ReferralInvite.fromInstallReferrer('ref=SGAB12CD&utm_source=invite'), 'SGAB12CD');
    expect(ReferralInvite.fromInstallReferrer('utm_source=invite%26ref%3Dsgab12cd'), 'SGAB12CD');
    expect(ReferralInvite.fromInstallReferrer('utm_source=google-play&utm_medium=organic'), isNull);
    expect(ReferralInvite.fromInstallReferrer(null), isNull);
  });

  test('builds the invitation link with the code inside', () {
    expect(ReferralInvite.inviteLink('SGAB12CD'), 'https://senga.afri-soft.com/?ref=SGAB12CD');
    expect(ReferralInvite.inviteLink('sgab12cd', driver: true), 'https://senga.afri-soft.com/?ref=SGAB12CD&app=driver');
  });
}
