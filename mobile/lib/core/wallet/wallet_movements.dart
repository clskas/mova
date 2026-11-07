import '../../core/i18n/i18n.dart';

/// Classification des mouvements portefeuille (recharge / retrait Mobile Money).
class WalletMovements {
  WalletMovements._();

  static bool isRecharge(Map<String, dynamic> tx) {
    final desc = tx['description']?.toString() ?? '';
    final ref = tx['reference']?.toString() ?? '';
    if (desc.startsWith('Recharge')) return true;
    if (ref.startsWith('topup_')) return true;
    if (desc.contains('Annulation retrait')) return true;
    return false;
  }

  static bool isWithdraw(Map<String, dynamic> tx) {
    final desc = tx['description']?.toString() ?? '';
    final ref = tx['reference']?.toString() ?? '';
    if (desc.startsWith('Retrait')) return true;
    if (ref.startsWith('withdraw_')) return true;
    return false;
  }

  static bool isMobileMoneyMovement(Map<String, dynamic> tx) =>
      isRecharge(tx) || isWithdraw(tx);

  static String label(Map<String, dynamic> tx) {
    final desc = tx['description']?.toString();
    if (desc != null && desc.isNotEmpty) return desc;
    if (isRecharge(tx)) return tr('Recharge');
    if (isWithdraw(tx)) return tr('Retrait');
    final type = tx['type']?.toString() ?? '';
    return type == 'CREDIT' ? tr('Crédit') : tr('Débit');
  }
}
