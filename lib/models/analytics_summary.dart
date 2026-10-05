class AnalyticsSummary {
  const AnalyticsSummary({
    required this.total,
    required this.byCategory,
    required this.bySeverity,
    required this.byBarangay,
    required this.byMonth,
    required this.activityLevel,
    required this.activityByBarangay,
  });

  final int total;
  final List<AnalyticsCount> byCategory;
  final List<AnalyticsCount> bySeverity;
  final List<AnalyticsCount> byBarangay;
  final List<AnalyticsCount> byMonth;
  final String activityLevel;
  final List<AnalyticsActivity> activityByBarangay;

  factory AnalyticsSummary.fromJson(Map<String, dynamic> json) {
    return AnalyticsSummary(
      total: (json['total'] as num).toInt(),
      byCategory: _readCounts(json['byCategory']),
      bySeverity: _readCounts(json['bySeverity']),
      byBarangay: _readCounts(json['byBarangay']),
      byMonth: _readCounts(json['byMonth']),
      activityLevel: json['activityLevel'] as String? ?? 'LOW',
      activityByBarangay: _readActivity(json['activityByBarangay']),
    );
  }

  static List<AnalyticsCount> _readCounts(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map<String, dynamic>>()
        .map(AnalyticsCount.fromJson)
        .toList(growable: false);
  }

  static List<AnalyticsActivity> _readActivity(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map<String, dynamic>>()
        .map(AnalyticsActivity.fromJson)
        .toList(growable: false);
  }
}

class AnalyticsCount {
  const AnalyticsCount({required this.label, required this.count});

  final String label;
  final int count;

  factory AnalyticsCount.fromJson(Map<String, dynamic> json) {
    return AnalyticsCount(
      label: json['label'] as String,
      count: (json['count'] as num).toInt(),
    );
  }
}

class AnalyticsActivity {
  const AnalyticsActivity({
    required this.label,
    required this.count,
    required this.level,
  });

  final String label;
  final int count;
  final String level;

  factory AnalyticsActivity.fromJson(Map<String, dynamic> json) {
    return AnalyticsActivity(
      label: json['label'] as String,
      count: (json['count'] as num).toInt(),
      level: json['level'] as String,
    );
  }
}
