// File note: This file handles incidents_screen.dart.
import 'package:flutter/material.dart';

import '../../models/incident.dart';
import '../../services/incident_service.dart';
import 'incident_details_screen.dart';

class IncidentsScreen extends StatefulWidget {
  const IncidentsScreen({super.key, this.incidentService});

  final IncidentService? incidentService;

  @override
  State<IncidentsScreen> createState() => _IncidentsScreenState();
}

class _IncidentsScreenState extends State<IncidentsScreen> {
  late final IncidentService _incidentService =
      widget.incidentService ?? IncidentService();
  final TextEditingController _searchController = TextEditingController();
  List<Incident> _incidents = [];
  String? _errorMessage;
  String? _selectedCategory;
  String? _selectedSeverity;
  String _searchQuery = '';
  IncidentFeedView _feedView = IncidentFeedView.recent;
  bool _isLoading = true;

  List<String> get _categories =>
      _incidents.map((incident) => incident.categoryName).toSet().toList()
        ..sort();

  List<Incident> get _visibleIncidents {
    final query = _searchQuery.trim().toLowerCase();
    return _incidents
        .where((incident) {
          final matchesQuery =
              query.isEmpty ||
              incident.categoryName.toLowerCase().contains(query) ||
              incident.categoryDescription.toLowerCase().contains(query) ||
              (incident.barangay ?? '').toLowerCase().contains(query) ||
              (incident.locationDescription ?? '').toLowerCase().contains(
                query,
              ) ||
              incident.city.toLowerCase().contains(query) ||
              incident.severity.toLowerCase().contains(query) ||
              incident.incidentDate.toIso8601String().toLowerCase().contains(
                query,
              ) ||
              incident.source.toLowerCase().contains(query) ||
              incident.sourceName.toLowerCase().contains(query) ||
              incident.verificationStatus.toLowerCase().contains(query) ||
              incident.description.toLowerCase().contains(query);
          final matchesCategory =
              _selectedCategory == null ||
              incident.categoryName == _selectedCategory;
          final matchesSeverity =
              _selectedSeverity == null ||
              incident.severity == _selectedSeverity;
          return matchesQuery && matchesCategory && matchesSeverity;
        })
        .toList(growable: false);
  }

  bool get _hasActiveFilters =>
      _searchQuery.trim().isNotEmpty ||
      _selectedCategory != null ||
      _selectedSeverity != null;

  @override
  void initState() {
    super.initState();
    _fetchIncidents();
  }

  Future<void> _fetchIncidents() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final incidents = await _incidentService.fetchIncidents(view: _feedView);
      if (!mounted) return;

      setState(() {
        _incidents = incidents;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _errorMessage = error is IncidentApiException
            ? error.message
            : 'Unable to load incidents. Please check your connection and try again.';
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    if (widget.incidentService == null) _incidentService.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(child: _buildHeader(context)),
                if (_isLoading)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_errorMessage != null)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _buildErrorState(context),
                  )
                else ...[
                  SliverToBoxAdapter(child: _buildFeedSelector(context)),
                  if (_incidents.isNotEmpty)
                    SliverToBoxAdapter(child: _buildSearchAndFilters(context)),
                  if (_incidents.isEmpty || _visibleIncidents.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: _EmptyState(
                        icon: Icons.search_off,
                        message: _incidents.isEmpty
                            ? _feedView == IncidentFeedView.recent
                                  ? 'No verified incidents in the last 90 days.'
                                  : 'No historical verified incidents found.'
                            : 'No incidents found.',
                        action: _incidents.isEmpty
                            ? null
                            : TextButton.icon(
                                onPressed: _clearFilters,
                                icon: const Icon(Icons.filter_alt_off_outlined),
                                label: const Text('Clear filters'),
                              ),
                      ),
                    )
                  else ...[
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          '${_visibleIncidents.length} '
                          '${_visibleIncidents.length == 1 ? 'incident' : 'incidents'}',
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                      ),
                    ),
                    SliverList.builder(
                      itemCount: _visibleIncidents.length,
                      itemBuilder: (context, index) => _IncidentCard(
                        incident: _visibleIncidents[index],
                        onTap: () => _openDetails(_visibleIncidents[index]),
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.zero,
              border: Border.all(
                color: theme.colorScheme.primary.withValues(alpha: 0.36),
              ),
            ),
            child: Icon(
              Icons.crisis_alert_outlined,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'COMMUNITY INCIDENT FEED',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.primary,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'Verified incidents',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Browse confirmed reports in your community',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchAndFilters(BuildContext context) {
    final categories = _categories;
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        children: [
          TextField(
            controller: _searchController,
            onChanged: (value) => setState(() => _searchQuery = value),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search category, barangay, or description',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchQuery.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = '');
                      },
                      icon: const Icon(Icons.close),
                    ),
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              final categoryField = DropdownButtonFormField<String?>(
                initialValue: _selectedCategory,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  prefixIcon: Icon(Icons.category_outlined),
                  border: OutlineInputBorder(),
                ),
                items: [
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('All categories'),
                  ),
                  ...categories.map(
                    (category) => DropdownMenuItem<String?>(
                      value: category,
                      child: Text(category, overflow: TextOverflow.ellipsis),
                    ),
                  ),
                ],
                onChanged: (value) => setState(() => _selectedCategory = value),
              );
              final severityField = DropdownButtonFormField<String?>(
                initialValue: _selectedSeverity,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Severity',
                  prefixIcon: Icon(Icons.shield_outlined),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem<String?>(
                    value: null,
                    child: Text('All severities'),
                  ),
                  DropdownMenuItem<String?>(value: 'LOW', child: Text('Low')),
                  DropdownMenuItem<String?>(
                    value: 'MEDIUM',
                    child: Text('Medium'),
                  ),
                  DropdownMenuItem<String?>(value: 'HIGH', child: Text('High')),
                ],
                onChanged: (value) => setState(() => _selectedSeverity = value),
              );

              if (constraints.maxWidth < 480) {
                return Column(
                  children: [
                    categoryField,
                    const SizedBox(height: 10),
                    severityField,
                  ],
                );
              }

              return Row(
                children: [
                  Expanded(child: categoryField),
                  const SizedBox(width: 12),
                  Expanded(child: severityField),
                ],
              );
            },
          ),
          if (_hasActiveFilters)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _clearFilters,
                icon: const Icon(Icons.filter_alt_off_outlined),
                label: const Text('Clear filters'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFeedSelector(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: SegmentedButton<IncidentFeedView>(
        segments: const [
          ButtonSegment(
            value: IncidentFeedView.recent,
            label: Text('Recent 90 days'),
            icon: Icon(Icons.new_releases_outlined),
          ),
          ButtonSegment(
            value: IncidentFeedView.historical,
            label: Text('Historical archive'),
            icon: Icon(Icons.history),
          ),
        ],
        selected: {_feedView},
        onSelectionChanged: (selection) {
          final nextView = selection.first;
          if (nextView == _feedView) return;
          setState(() => _feedView = nextView);
          _fetchIncidents();
        },
      ),
    );
  }

  Widget _buildErrorState(BuildContext context) {
    return _EmptyState(
      icon: Icons.cloud_off_outlined,
      message: _errorMessage!,
      action: FilledButton.icon(
        onPressed: _fetchIncidents,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }

  void _clearFilters() {
    _searchController.clear();
    setState(() {
      _searchQuery = '';
      _selectedCategory = null;
      _selectedSeverity = null;
    });
  }

  void _openDetails(Incident incident) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => IncidentDetailsScreen(incident: incident),
      ),
    );
  }
}

class _IncidentCard extends StatelessWidget {
  const _IncidentCard({required this.incident, required this.onTap});

  final Incident incident;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final severityColor = _severityColor(incident.severity, theme.colorScheme);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            border: Border(left: BorderSide(color: severityColor, width: 3)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'CATEGORY',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                              letterSpacing: 0.8,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            incident.categoryName,
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    _StatusBadge(
                      label: incident.severity,
                      color: severityColor,
                      icon: Icons.priority_high,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 14,
                  runSpacing: 7,
                  children: [
                    _IconLabel(
                      icon: Icons.location_on_outlined,
                      label:
                          incident.locationDescription ??
                          incident.barangay ??
                          incident.city,
                    ),
                    _IconLabel(
                      icon: Icons.schedule,
                      label: _formatIncidentDate(context, incident),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  incident.description,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(height: 1.4),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _StatusBadge(
                      label: 'VERIFIED',
                      color: theme.colorScheme.primary,
                      icon: Icons.verified_outlined,
                    ),
                    _IconLabel(
                      icon: Icons.source_outlined,
                      label: incident.sourceName,
                      style: theme.textTheme.labelMedium,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    required this.color,
    required this.icon,
  });

  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.zero,
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _IconLabel extends StatelessWidget {
  const _IconLabel({required this.icon, required this.label, this.style});

  final IconData icon;
  final String label;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 17,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 6),
        Flexible(child: Text(label, style: style)),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.message, this.action});

  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 42, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge,
            ),
            if (action != null) ...[const SizedBox(height: 12), action!],
          ],
        ),
      ),
    );
  }
}

Color _severityColor(String severity, ColorScheme colorScheme) {
  switch (severity.toUpperCase()) {
    case 'LOW':
      return Colors.green.shade700;
    case 'MEDIUM':
      return Colors.orange.shade800;
    case 'HIGH':
      return colorScheme.error;
    default:
      return colorScheme.primary;
  }
}

String _formatIncidentDate(BuildContext context, Incident incident) {
  final localDate = incident.incidentDate.toLocal();
  final dateLabel = MaterialLocalizations.of(
    context,
  ).formatMediumDate(localDate);
  if (!incident.incidentTimeKnown) return dateLabel;
  final timeLabel = MaterialLocalizations.of(
    context,
  ).formatTimeOfDay(TimeOfDay.fromDateTime(localDate));
  return '$dateLabel at $timeLabel';
}
