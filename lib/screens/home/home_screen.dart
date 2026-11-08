// File note: This file handles home_screen.dart.
import 'package:flutter/material.dart';

import '../../models/analytics_summary.dart';
import '../../models/incident.dart';
import '../../services/analytics_service.dart';
import '../../services/incident_service.dart';
import '../incidents/incident_details_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    this.onOpenMap,
    this.onOpenIncidents,
    this.incidentService,
  });

  final VoidCallback? onOpenMap;
  final VoidCallback? onOpenIncidents;
  final IncidentService? incidentService;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final AnalyticsService _service = AnalyticsService();
  late final IncidentService _incidentService =
      widget.incidentService ?? IncidentService();
  AnalyticsSummary? _summary;
  List<Incident> _recentIncidents = [];
  String? _errorMessage;
  String? _incidentsError;
  bool _isLoading = true;
  bool _incidentsLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSummary();
    _loadRecentIncidents();
  }

  Future<void> _loadRecentIncidents() async {
    setState(() {
      _incidentsLoading = true;
      _incidentsError = null;
    });
    try {
      final incidents = await _incidentService.fetchIncidents(
        view: IncidentFeedView.recent,
      );
      if (!mounted) return;
      final verified =
          incidents
              .where(
                (incident) =>
                    incident.verificationStatus.toUpperCase() == 'VERIFIED',
              )
              .toList()
            ..sort(
              (first, second) =>
                  second.incidentDate.compareTo(first.incidentDate),
            );
      setState(() {
        _recentIncidents = verified.take(3).toList(growable: false);
        _incidentsLoading = false;
      });
    } on IncidentApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _incidentsError = error.message;
        _incidentsLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _incidentsError = 'Recent incidents are unavailable. Please try again.';
        _incidentsLoading = false;
      });
    }
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
    if (widget.incidentService == null) _incidentService.close();
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
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary,
                    shape: BoxShape.rectangle,
                  ),
                ),
                const SizedBox(width: 9),
                Text(
                  'TAGUIG CITY + PATEROS  /  VERIFIED DATA',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.primary,
                    letterSpacing: 1.15,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 9),
            Text(
              'Safety intelligence',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'A clear view of verified incident activity across Taguig City and Pateros.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: widget.onOpenMap,
                  icon: const Icon(Icons.map_outlined),
                  label: const Text('Open live map'),
                ),
                OutlinedButton.icon(
                  onPressed: widget.onOpenIncidents,
                  icon: const Icon(Icons.list_alt_outlined),
                  label: const Text('Browse incidents'),
                ),
              ],
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
                      'No verified incidents in Taguig City or Pateros are currently available.',
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
            const SizedBox(height: 22),
            _RecentIncidentsSection(
              incidents: _recentIncidents,
              isLoading: _incidentsLoading,
              errorMessage: _incidentsError,
              onRetry: _loadRecentIncidents,
              onOpenIncidents: widget.onOpenIncidents,
            ),
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
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.zero,
                border: Border.all(color: color.withValues(alpha: 0.32)),
              ),
              child: Icon(Icons.monitor_heart_outlined, color: color, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'CURRENT ACTIVITY',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    level.toUpperCase(),
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    '$total verified ${total == 1 ? 'incident' : 'incidents'} recorded',
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
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SectionHeading(
                title: 'Activity by barangay',
                icon: Icons.location_city_outlined,
              ),
              const SizedBox(height: 14),
              ...rows.map((row) {
                final color = _activityColor(row.level);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 11),
                  child: Row(
                    children: [
                      Expanded(child: Text(row.label)),
                      Text(
                        '${row.count}',
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.zero,
                        ),
                        child: Text(
                          row.level,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: color,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}

Color _activityColor(String level) => switch (level.toUpperCase()) {
  'LOW' => const Color(0xFF176B3A),
  'MODERATE' => const Color(0xFF755000),
  'HIGH' => const Color(0xFF9A4B00),
  'VERY HIGH' => const Color(0xFFA61B1B),
  _ => const Color(0xFF555555),
};

class _RecentIncidentsSection extends StatelessWidget {
  const _RecentIncidentsSection({
    required this.incidents,
    required this.isLoading,
    required this.errorMessage,
    required this.onRetry,
    required this.onOpenIncidents,
  });

  final List<Incident> incidents;
  final bool isLoading;
  final String? errorMessage;
  final VoidCallback onRetry;
  final VoidCallback? onOpenIncidents;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Recent verified incidents',
                style: theme.textTheme.titleLarge,
              ),
            ),
            TextButton(
              onPressed: onOpenIncidents,
              child: const Text('View all'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (isLoading)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (errorMessage != null)
          _AnalyticsMessage(
            icon: Icons.cloud_off_outlined,
            message: errorMessage!,
            action: TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          )
        else if (incidents.isEmpty)
          const _AnalyticsMessage(
            icon: Icons.fact_check_outlined,
            message: 'No verified incidents are currently available.',
          )
        else
          ...incidents.map(
            (incident) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 6,
                  ),
                  title: Text(
                    incident.categoryName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Text(
                      '${incident.barangay ?? incident.city} · '
                      '${incident.incidentDate.toLocal().toString().split(' ').first}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  trailing: _SeverityLabel(severity: incident.severity),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => IncidentDetailsScreen(incident: incident),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _SeverityLabel extends StatelessWidget {
  const _SeverityLabel({required this.severity});

  final String severity;

  @override
  Widget build(BuildContext context) {
    final normalized = severity.toUpperCase();
    final color = switch (normalized) {
      'HIGH' => const Color(0xFFA61B1B),
      'MEDIUM' => const Color(0xFF755000),
      _ => const Color(0xFF176B3A),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.zero,
      ),
      child: Text(
        normalized,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

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
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: const BoxDecoration(color: Colors.white),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final isCompact = constraints.maxWidth < 440;
              final icon = Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.zero,
                  border: Border.all(
                    color: theme.colorScheme.primary.withValues(alpha: 0.42),
                  ),
                ),
                child: Icon(
                  Icons.verified_user_outlined,
                  color: theme.colorScheme.primary,
                  size: 25,
                ),
              );
              final reportSummary = Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'VERIFIED INCIDENTS',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.primary,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$total',
                    style: theme.textTheme.displaySmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      height: 1.05,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Published reports in Taguig City and Pateros',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              );
              final highSeveritySummary = Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.priority_high_rounded,
                    color: theme.colorScheme.error,
                    size: 19,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '$highSeverityTotal',
                    style: theme.textTheme.titleLarge?.copyWith(
                      color: theme.colorScheme.error,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    isCompact ? 'HIGH severity incidents' : 'HIGH',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      letterSpacing: 0.9,
                    ),
                  ),
                ],
              );

              if (isCompact) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        icon,
                        const SizedBox(width: 14),
                        Expanded(child: reportSummary),
                      ],
                    ),
                    const Divider(height: 28),
                    highSeveritySummary,
                  ],
                );
              }

              return Row(
                children: [
                  icon,
                  const SizedBox(width: 16),
                  Expanded(child: reportSummary),
                  Container(
                    width: 1,
                    height: 54,
                    color: theme.colorScheme.outline,
                  ),
                  const SizedBox(width: 16),
                  highSeveritySummary,
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 19, color: theme.colorScheme.primary),
        const SizedBox(width: 9),
        Text(
          title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
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
      padding: const EdgeInsets.only(bottom: 14),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SectionHeading(title: title, icon: icon),
              const SizedBox(height: 16),
              ...rows.map((row) {
                final fraction = maximum == 0 ? 0.0 : row.count / maximum;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 13),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text(row.label)),
                          const SizedBox(width: 8),
                          Text(
                            '${row.count}',
                            style: theme.textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 7),
                      LinearProgressIndicator(
                        value: fraction,
                        minHeight: 5,
                        borderRadius: BorderRadius.zero,
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
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
