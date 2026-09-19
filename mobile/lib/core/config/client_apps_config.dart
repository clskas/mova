/// Helpers for `/public/client-config` payload (MM + passenger service tiles).

bool mmChannelEnabled(Object? rawOp, String channel) {
  if (rawOp == true) return true;
  if (rawOp == false) return false;
  if (rawOp is Map) {
    final v = rawOp[channel];
    if (v is bool) return v;
    // Legacy: any visible channel if key missing
    if (channel == 'topup') return rawOp['topup'] == true || rawOp['withdraw'] == true && rawOp['topup'] == null;
    return rawOp['withdraw'] == true;
  }
  return false;
}

bool mmOperatorEnabledFor(Object? appRow, String operatorId, String channel) {
  if (appRow is! Map) return false;
  return mmChannelEnabled(appRow[operatorId], channel);
}

bool passengerServiceVisible(Object? services, String id) {
  if (services is! Map) return true;
  final v = services[id];
  if (v is bool) return v;
  return true;
}
