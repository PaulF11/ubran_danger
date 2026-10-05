import 'package:flutter/material.dart';

import '../../models/analytics_summary.dart';
import '../../services/analytics_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final AnalyticsService _service = AnalyticsService();
  AnalyticsSummary? _summary;
  String? _errorMessage;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  Future<void> _loadSummary() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final summary = await _service.fetchSummary();
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _isLoading = false;
      });
    } on AnalyticsException catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = error.message;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Analytics are unavailable. Please try again.';
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _service.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 820),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 32),
          children: [
            Text(
              'Urban Danger Intelligence System',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              'Verified incident information for Taguig City',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 18),
            if (_isLoading)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_errorMessage != null)
              _AnalyticsMessage(
                icon: Icons.cloud_off_outlined,
                message: _errorMessage!,
                action: FilledButton.icon(
                  onPressed: _loadSummary,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                ),
              )
            else if (_summary != null) ...[
              _TotalReportsCard(
                total: _summary!.total,
                highSeverityTotal: _summary!.bySeverity
                    .where((row) => row.label.toUpperCase() == 'HIGH')
                    .fold(0, (total, row) => total + row.count),
              ),
              const SizedBox(height: 20),
              _IncidentActivityCard(
                level: _summary!.activityLevel,
                total: _summary!.total,
              ),
              if (_summary!.activityByBarangay.isNotEmpty) ...[
                const SizedBox(height: 18),
                _ActivitySection(rows: _summary!.activityByBarangay),
              ],
              if (_summary!.total == 0)
                const _AnalyticsMessage(
                  icon: Icons.location_city_outlined,
                  message:
                      'No verified Taguig incidents are currently available.',
                )
              else ...[
                _AnalyticsSection(
                  title: 'By severity',
                  icon: Icons.shield_outlined,
                  rows: _summary!.bySeverity,
                ),
                _AnalyticsSection(
                  title: 'By category',
                  icon: Icons.category_outlined,
                  rows: _summary!.byCategory,
                ),
                _AnalyticsSection(
                  title: 'By barangay',
                  icon: Icons.location_on_outlined,
                  rows: _summary!.byBarangay,
                ),
                _AnalyticsSection(
                  title: 'Reported over time',
                  icon: Icons.calendar_month_outlined,
                  rows: _summary!.byMonth,
                ),
              ],
              const SizedBox(height: 12),
              Text(
                'Incident activity is based on verified incidents collected by Urban Danger. It is not an official crime rate or safety rating and does not guarantee personal safety.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _IncidentActivityCard extends StatelessWidget {
  const _IncidentActivityCard({required this.level, required this.total});

  final String level;
  final int total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _activityColor(level);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(Icons.assessment_outlined, color: color, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'INCIDENT ACTIVITY · ${level.toUpperCase()}',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '$total verified ${total == 1 ? 'incident' : 'incidents'} recorded in Taguig',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActivitySection extends StatelessWidget {
  const _ActivitySection({required this.rows});

  final List<AnalyticsActivity> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.location_city_outlined,
                size: 20,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 8),
              Text(
                'Incident activity by barangay',
                style: theme.textTheme.titleMedium,
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...rows.map((row) {
            final color = _activityColor(row.level);
            return Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: Row(
                children: [
                  Expanded(child: Text(row.label)),
                  Text('${row.count}  ', style: theme.textTheme.labelLarge),
                  Text(
                    row.level,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

Color _activityColor(String level) => switch (level.toUpperCase()) {
  'LOW' => Colors.green.shade700,
  'MODERATE' => Colors.amber.shade800,
  'HIGH' => Colors.orange.shade800,
  'VERY HIGH' => Colors.red.shade800,
  _ => Colors.grey.shade700,
};

class _TotalReportsCard extends StatelessWidget {
  const _TotalReportsCard({
    required this.total,
    required this.highSeverityTotal,
  });

  final int total;
  final int highSeverityTotal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      color: theme.colorScheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(
              Icons.fact_check_outlined,
              size: 32,
              color: theme.colorScheme.onPrimaryContainer,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$total',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                  Text(
                    'Verified Incidents in Taguig',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$highSeverityTotal High Severity Incidents',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AnalyticsSection extends StatelessWidget {
  const _AnalyticsSection({
    required this.title,
    required this.icon,
    required this.rows,
  });

  final String title;
  final IconData icon;
  final List<AnalyticsCount> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maximum = rows.fold<int>(
      0,
      (value, item) => item.count > value ? item.count : value,
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Text(title, style: theme.textTheme.titleMedium),
            ],
          ),
          const SizedBox(height: 12),
          ...rows.map((row) {
            final fraction = maximum == 0 ? 0.0 : row.count / maximum;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(row.label)),
                      const SizedBox(width: 8),
                      Text('${row.count}', style: theme.textTheme.labelLarge),
                    ],
                  ),
                  const SizedBox(height: 5),
                  LinearProgressIndicator(value: fraction),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _AnalyticsMessage extends StatelessWidget {
  const _AnalyticsMessage({
    required this.icon,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 12),
      child: Column(
        children: [
          Icon(icon, size: 40, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (action != null) ...[const SizedBox(height: 14), action!],
        ],
      ),
    );
  }
}
